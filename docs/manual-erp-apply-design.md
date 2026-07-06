# 정규화 주문 수동 ERP 전송 기능 설계

## 1. 목표

자동 ERP 반영이 OFF인 주문 또는 ERP 보정 후 다시 전송해야 하는 주문을 운영자가 선택해 ERP_APPLY 단계부터 실행한다.

수동 전송은 쇼핑몰 주문수집과 정규화를 다시 실행하지 않는다.

```text
hub_collected_order 선택
  → 수동 ERP 전송 요청
  → ERP_APPLY Job + Outbox
  → Worker
  → hub_erp_apply_result
```

이번 문서는 구현 전 계약이며 API, UI, DB는 후속 작업에서 추가한다.

## 2. 범위

포함:

- 정규화 주문 선택
- ERP 연결 선택
- CREATE 중심 ERP_APPLY Job 생성
- Outbox 발행
- 중복 전송 방어
- Pipeline/결과/로그 추적
- 부분 실패와 재시도 기준

제외:

- 실제 ERP별 필드 매핑 UI
- ERP_MAPPING 별도 Job
- 승인 결재 워크플로
- 주문 상태 역동기화
- 강제 중복 전송

## 3. 제안 API

### 전송 가능 여부 조회

`GET /api/hub/erp/apply-candidates`

조건 후보:

- `corpId`
- `erpConnectionId`
- `channelAccountId`
- `fromDate`, `toDate`
- `erpStatus`: NOT_APPLIED, FAILED
- `orderNo`
- `page`, `size`

응답에는 normalizedOrderId, 주문번호, 채널, 주문일, 최근 ERP 상태, 최근 오류, sourceNormalizeJobId를 포함한다.

### 수동 전송 요청

`POST /api/hub/erp/apply-requests`

```json
{
  "erpConnectionId": "ERP-100",
  "normalizedOrderIds": [101, 102],
  "operation": "CREATE",
  "reason": "운영자 확인 후 수동 전송"
}
```

서버가 인증 사용자에서 userId/corpId를 결정한다. 클라이언트가 tenantId, correlationId, parentJobId, idempotencyKey를 임의로 지정하지 못하게 한다.

응답 예시:

```json
{
  "commandId": "manual-erp-command-uuid",
  "accepted": 2,
  "skipped": 0,
  "jobs": [
    {
      "requestId": "erp-apply-job-uuid",
      "jobType": "ERP_APPLY",
      "status": "QUEUED"
    }
  ]
}
```

## 4. 검증 규칙

요청 트랜잭션에서 다음을 검증한다.

1. ERP 연결이 요청 사용자의 corpId에 속하는지
2. 연결이 active인지
3. 모든 normalizedOrderId가 같은 corpId에 속하는지
4. 주문이 정규화 완료 상태인지
5. operation을 해당 ERP 연결이 지원하는지
6. 이미 APPLIED인 동일 business version인지
7. 동일 주문에 QUEUED/PROCESSING ERP_APPLY가 있는지

다른 고객사의 주문 ID가 하나라도 포함되면 전체 요청을 거부한다. 단순히 조회 결과에서 누락시키면 존재 여부를 추측할 수 있으므로 404 또는 권한 정책에 맞는 오류로 처리한다.

## 5. Job 분할 기준

하나의 ERP_APPLY Job은 다음 기준이 같아야 한다.

- corpId
- erpConnectionId
- operation
- sourceNormalizeJobId 또는 correlationId

선택 주문이 여러 Normalize 파이프라인에서 왔다면 sourceNormalizeJobId별로 ERP_APPLY Job을 나눈다. `parent_job_id`는 각 source ORDER_NORMALIZE requestId를 사용한다.

관계 필드:

| 필드 | 값 |
|---|---|
| `requestId` | 새로운 ERP_APPLY Job UUID |
| `parentJobId` | source ORDER_NORMALIZE requestId |
| `correlationId` | source Normalize의 correlationId 상속 |
| `causationId` | 수동 전송 commandId |
| `schemaVersion` | `1.0` |
| `payloadVersion` | `1.0` |

수동 명령 자체를 감사·추적하려면 `hub_erp_apply_command` 테이블을 추가하는 것이 좋다.

## 6. ERP_APPLY payload

```json
{
  "sourceNormalizeJobId": "normalize-request-id",
  "normalizedOrderIds": [101, 102],
  "corpId": 100,
  "userId": 1,
  "channelAccountId": 10,
  "channelCd": "GODO",
  "erpConnectionId": "ERP-100",
  "operation": "CREATE",
  "idempotencyKey": "server-generated-key",
  "triggerType": "MANUAL",
  "manualCommandId": "manual-erp-command-uuid"
}
```

Kafka payload에는 client_secret, access_token, refresh_token을 넣지 않는다. Worker가 erpConnectionId로 최신 연결 설정을 조회한다.

## 7. 멱등성

UI 중복 클릭, HTTP 재전송, Kafka 중복 전달을 각각 구분한다.

### HTTP 요청 멱등성

프론트가 submit 시작 시 `clientRequestId`를 한 번 생성하고 요청 재전송 시 같은 값을 사용한다. 서버는 `corpId + clientRequestId` unique로 같은 command 응답을 반환한다.

### ERP 업무 멱등성

권장 business key:

```text
erpConnectionId + operation + normalizedOrderId + normalizedOrderVersion
```

현재 `idempotency_key + normalized_order_id` unique constraint를 유지한다. 같은 주문이 이미 APPLIED이면 Adapter를 다시 호출하지 않고 기존 성공을 반환한다.

운영자의 강제 재전송은 이번 범위에서 허용하지 않는다. 향후 필요하면 별도 권한과 force reason, 새로운 business version 정책이 필요하다.

## 8. 트랜잭션과 Outbox

수동 전송 API는 한 DB 트랜잭션에서 처리한다.

1. 대상 주문과 ERP 연결 `FOR UPDATE` 또는 일관된 검증
2. command row 저장
3. ERP_APPLY Job 저장
4. ERP_APPLY Outbox PENDING 저장
5. command-job 관계 저장
6. commit

Kafka Producer를 직접 호출하지 않는다. API 응답 성공은 Kafka 발행 성공이 아니라 Job/Outbox 저장 성공을 의미한다.

## 9. 부분 실패 정책

요청 검증 실패는 기본적으로 전체 거부한다. Job 생성 이후 ERP 처리 결과는 주문별로 저장한다.

- 주문 1개 실패: 해당 `hub_erp_apply_result` FAILED
- 다른 주문 성공: APPLIED 유지
- Job 상태: 모든 주문 성공이면 SUCCESS, 하나라도 기술 실패면 기존 retry 정책 적용
- 확정 업무 오류: 자동 retry하지 않고 주문별 FAILED/REJECTED 확장 검토

현재 결과 테이블 상태는 APPLIED/FAILED 중심이므로 향후 BUSINESS_REJECTED를 추가할 수 있다.

## 10. UI 설계

수집 주문 화면 또는 ERP 반영 결과 화면에 “ERP 전송 대기” 필터를 추가한다.

최소 UI:

1. 정규화 주문 목록 checkbox
2. ERP 연결 선택 combo
3. operation 표시(CREATE 고정)
4. 선택 건수와 이미 반영된 건수 안내
5. 전송 확인 modal
6. 요청 중 버튼 비활성화
7. 성공 후 생성 Job과 Pipeline 링크
8. 실패 시 서버 error message 표시

버튼 활성화 조건:

- 선택 주문 1건 이상
- 같은 corpId
- 활성 ERP 연결 선택
- APPLIED 또는 QUEUED/PROCESSING 중복 대상이 아님

## 11. 상태와 조회

기존 API를 재사용한다.

- Job 흐름: `GET /api/hub/jobs/{requestId}/pipeline`
- ERP 결과: `GET /api/hub/erp/apply-results`
- 실패 재처리: `POST /api/hub/jobs/{erpApplyRequestId}/retry`

수동 commandId를 pipeline 응답에 직접 포함하려면 command relation 조회를 추가한다.

## 12. 보안과 감사

감사 정보 후보:

- commandId
- corpId/userId
- 선택 주문 ID
- ERP 연결 ID
- operation
- reason
- clientRequestId
- 요청 시각/IP/User-Agent
- 생성 Job ID
- accepted/skipped/failed count

secret과 token은 command, Job, Outbox, 로그에 저장하지 않는다.

## 13. 단계적 구현 순서

1. `hub_erp_apply_command`와 command-job relation schema
2. 후보 조회 API
3. 수동 전송 command service와 Job/Outbox 트랜잭션
4. 멱등성/tenant/중복 처리 테스트
5. 주문 선택 UI와 confirm
6. Pipeline/결과 화면 연결
7. 운영 감사 로그와 권한 강화

## 14. 필수 테스트

- 자동 ERP OFF 주문을 수동 ERP_APPLY로 생성
- 수집/정규화를 다시 실행하지 않음
- 다른 corpId 주문 거부
- 비활성 ERP 연결 거부
- Job과 Outbox 원자 저장
- parent/correlation/causation 계약
- 동일 clientRequestId 중복 command 방어
- 이미 APPLIED인 주문 skip/거부 정책
- 동일 주문 QUEUED/PROCESSING 중복 방어
- Kafka 중복 처리 시 Adapter 재호출 방어
- FAILED ERP_APPLY는 기존 retry API로 해당 단계만 재처리