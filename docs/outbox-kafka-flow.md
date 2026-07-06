# Outbox와 Kafka Job 발행 흐름

## 1. 문서 목적

이 문서는 Easy Hub에서 Job이 DB에 생성된 뒤 Kafka로 발행되고 Worker가 후속 Job을 만드는 전체 경계를 설명한다. 핵심 원칙은 업무 상태와 메시지 발행 상태를 분리하는 것이다.

- `hub_job.status`: 업무 처리 상태
- `hub_job_outbox.status`: Kafka 발행 상태
- Kafka offset: consumer group의 메시지 소비 위치

세 상태는 같은 의미가 아니다.

## 2. 전체 흐름

```text
Hub API
  → hub_job QUEUED + hub_job_outbox PENDING (한 트랜잭션)
  → Outbox Publisher claim PUBLISHING
  → Kafka hub.jobs publish
  → hub_job_outbox SENT
  → Worker consume
  → hub_job PROCESSING
  → 업무 결과 저장
  → 현재 Job SUCCESS + child Job QUEUED + child Outbox PENDING (한 트랜잭션)
```

현재 파이프라인:

```text
ORDER_COLLECT
  → ORDER_NORMALIZE
  → [autoErpApply=true] ERP_APPLY
```

## 3. 최초 Job 발행

사용자 또는 스케줄러가 주문수집을 요청하면 API 트랜잭션에서 다음을 처리한다.

1. `hub_job`에 ORDER_COLLECT QUEUED 저장
2. resource 기반 partition key 계산
3. `hub_job_outbox`에 ORDER_COLLECT PENDING 저장
4. DB commit

API는 Kafka Producer를 직접 호출하지 않는다. DB commit 이후 공통 Outbox Publisher가 발행한다.

수동 수집은 실행할 때마다 새로운 executionId와 requestId를 사용한다. 동일 날짜의 의도적인 재수집은 새 Job이고, 동일 Kafka 메시지 재전달은 같은 requestId인 중복 전달이다.

## 4. Outbox Publisher

Publisher 처리:

```text
PENDING + next_retry_at 도달
  → FOR UPDATE SKIP LOCKED claim
  → PUBLISHING
  → 저장된 topic / partition_key / payload로 Kafka 발행
  → 성공: SENT + published_at
  → 실패: backoff 후 PENDING 또는 최대 초과 FAILED
```

Publisher는 partition key를 다시 계산하지 않고 Outbox에 저장된 값을 사용한다. 이를 통해 API, retry, replay가 결정한 순서 보장 기준이 발행 시점에도 유지된다.

오래된 PUBLISHING은 Publisher가 claim 직후 종료된 상태일 수 있으므로 stale 기준을 넘으면 다시 claim한다.

## 5. Worker와 후속 Job

### ORDER_COLLECT 완료 트랜잭션

1. `hub_job_result` Raw 결과 저장
2. 주문이 있으면 ORDER_NORMALIZE child 생성
3. ORDER_NORMALIZE Outbox PENDING 생성
4. ORDER_COLLECT SUCCESS
5. commit

어느 하나라도 실패하면 전체 rollback한다. ORDER_COLLECT SUCCESS는 정규화 업무가 끝났다는 뜻이 아니라, 수집 결과와 다음 단계 실행 요청이 DB에 안전하게 저장됐다는 뜻이다.

주문이 0건이면 ORDER_NORMALIZE를 생성하지 않고 ORDER_COLLECT만 SUCCESS 처리한다.

### ORDER_NORMALIZE 완료 트랜잭션

1. 정규화 주문 upsert
2. 자동 ERP 설정 확인
3. ON이면 ERP_APPLY child와 Outbox PENDING 생성
4. OFF이면 `ERP_AUTO_APPLY_DISABLED` 로그 저장
5. ORDER_NORMALIZE SUCCESS
6. commit

### ERP_APPLY 완료

Mock 또는 실제 ERP Adapter 호출 결과를 `hub_erp_apply_result`에 저장하고 ERP_APPLY 상태를 SUCCESS 또는 retry/FAILED 흐름으로 전환한다.

## 6. 상태 의미

| 상태 | 의미 |
|---|---|
| Job `QUEUED` | 실행 가능한 Job. Kafka 발행 전일 수도 있고 발행 후일 수도 있음 |
| Outbox `PENDING` | 아직 Kafka 발행되지 않았거나 재발행 대기 |
| Outbox `PUBLISHING` | Publisher가 claim한 상태 |
| Outbox `SENT` | Kafka broker가 발행을 acknowledge함 |
| Job `PROCESSING` | Worker가 Job claim 후 업무 처리 중 |
| Job `SUCCESS` | 해당 단계 업무와 필요한 후속 DB 기록이 commit됨 |
| Job `FAILED` | 자동 retry가 끝났거나 non-retryable 오류 |

예를 들어 ORDER_NORMALIZE Outbox가 SENT라고 해서 정규화가 성공한 것은 아니다. ORDER_NORMALIZE Job SUCCESS로 업무 성공을 판단한다.

## 7. Partition key와 Lock key

| Job | Partition key | Lock |
|---|---|---|
| ORDER_COLLECT | `channel-account:{tenant}:{channelAccountId}` | 같은 값 사용 |
| ORDER_NORMALIZE | `sourceRequestId` | 기본적으로 없음 |
| ERP_APPLY | `erp-connection:{tenant}:{erpConnectionId}` | 같은 ERP 연결 기준 |

Kafka key는 같은 외부 자원의 순서를 맞추는 1차 방어다. DB Lock은 Recovery, retry, 중복 발행 등 여러 진입 경로에서 실제 외부 API 동시 호출을 막는 최종 방어다.

Lock 충돌은 앞 작업을 실패시키지 않는다. 뒤 작업이 보류 또는 재시도되며, 현재는 별도 WAITING_LOCK 상태가 없어 QUEUED/retry 로그로 관측될 수 있다.

## 8. Retry와 Replay

### 자동 retry

Worker 오류 분류 후 retry 가능한 오류이면 같은 Job을 사용한다.

- requestId 유지
- jobType 유지
- payload 유지
- parent/correlation/causation 유지
- retry_count 증가
- next_retry_at 설정

### 운영자 수동 retry

`POST /api/hub/jobs/{requestId}/retry`

- FAILED Job만 허용
- payload 계약 검증
- 기존 Job을 QUEUED로 전환
- 이전 Outbox partition key 우선 재사용
- 새 Outbox PENDING 생성
- Kafka 직접 발행 금지

SUCCESS, PROCESSING, QUEUED Job은 일반 수동 retry 대상이 아니다.

### DLQ replay

DLQ의 `job.jobType`과 DB의 원 Job Type이 일치하는지 확인하고 원 payload/envelope로 Outbox를 만든다. ORDER_NORMALIZE 실패를 ORDER_COLLECT로 되돌리거나 ERP_APPLY 실패 때문에 수집 API를 다시 호출하지 않는다.

## 9. 장애 구간과 복구

| 장애 구간 | 남는 상태 | 복구 방식 |
|---|---|---|
| Job/Outbox 트랜잭션 실패 | 둘 다 rollback | API 재요청 |
| commit 후 Publisher 실행 전 | Outbox PENDING | Publisher 주기 claim |
| PUBLISHING 후 프로세스 종료 | stale PUBLISHING | stale reclaim |
| Kafka 발행 후 SENT 갱신 전 | 중복 발행 가능 | Job claim과 업무 멱등성 방어 |
| Worker PROCESSING 중 종료 | stale PROCESSING | Recovery Scanner |
| child Job은 QUEUED인데 Outbox 없음 | 비정상 불일치 | 탐지 로그/Recovery 보강 대상 |

## 10. 현재 제한사항

- Worker의 자동 retry는 DB 상태를 QUEUED로 돌린 뒤 Recovery가 처리하는 구조이며, 모든 자동 retry가 Outbox 재발행을 만드는 방식은 아니다.
- retry 초과 시 Kafka DLQ 발행은 Worker의 DLQ Producer를 사용한다. DLQ 자체의 DB Outbox 영속화는 후속 과제다.
- `QUEUED + Outbox 없음` 자동 복구와 WAITING_LOCK 상태는 아직 구현하지 않았다.
- Kafka 발행은 at-least-once로 보고, 최종 중복 방어는 requestId claim과 주문 upsert, ERP idempotency key가 담당한다.

## 11. 운영 점검 순서

1. `hub_job`에서 현재 업무 단계와 status 확인
2. 같은 requestId의 `hub_job_outbox` 상태 확인
3. Outbox SENT이면 Kafka topic/partition/offset과 lag 확인
4. Job 로그에서 RECEIVED, PROCESSING, SUCCESS/FAILED 확인
5. retry_count, next_retry_at, error category 확인
6. child Job의 parent/correlation 관계 확인
7. ERP 단계는 `hub_erp_apply_result`의 APPLIED/FAILED와 idempotency key 확인