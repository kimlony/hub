# Easy Hub 주문 연동 파이프라인 계약 설계

## 1. 문서 목적과 적용 원칙

이 문서는 Easy Hub를 쇼핑몰 및 외부 주문관리 플랫폼과 고객사 ERP 사이의 주문 연동 허브로 확장하기 위한 파이프라인 계약을 정의한다. 구현 세부사항보다 Job 경계, 메시지 계약, 순서 보장, 멱등성, 상태 및 복구 기준을 우선한다.

현재 운영 흐름인 `ORDER_COLLECT -> ORDER_NORMALIZE`는 유지하면서 다음 목표 흐름으로 단계적으로 확장한다.

```text
직접 쇼핑몰 수집
ORDER_COLLECT -> ORDER_INGEST -> ORDER_NORMALIZE -> ERP_MAPPING -> ERP_APPLY

외부 플랫폼 수신
EXTERNAL_ORDER_IMPORT -> ORDER_INGEST -> ORDER_NORMALIZE -> ERP_MAPPING -> ERP_APPLY

주문 상태 동기화
ORDER_STATUS_SYNC -> ORDER_INGEST 또는 상태 변경 Raw 저장 -> ORDER_NORMALIZE -> ERP_MAPPING -> ERP_APPLY
```

핵심 원칙은 다음과 같다.

- 모든 단계는 독립 Job으로 추적한다.
- Raw 저장 성공, 정규화 성공, ERP 매핑 성공, ERP 반영 성공을 서로 다른 상태로 관리한다.
- 후속 Job 생성과 Outbox 저장은 하나의 DB 트랜잭션으로 처리한다.
- Kafka key와 DB lock key는 Job Type이 아니라 보호할 외부 자원을 기준으로 한다.
- 재처리는 실패 단계부터 시작하며 이미 성공한 외부 호출을 불필요하게 반복하지 않는다.
- 메시지에는 계약 버전을 포함하고, Job Type별 validation을 적용한다.
- 기술적 전달의 at-least-once 특성을 전제로 모든 경계에서 멱등성을 보장한다.

초기 호환 단계에서는 현재 `corpId`를 표준 tenant 식별자로 사용한다. 장기적으로 `tenantId`를 도입하더라도 메시지에 둘을 동시에 요구하지 않고, `tenantId`를 canonical field로 두며 기존 시스템에서는 `tenantId = String(corpId)`로 변환한다.

---

## 2. 공통 Job Envelope와 Payload 계약

### 2.1 공통 메시지 Envelope

Kafka에 전달되는 모든 Job은 다음 공통 구조를 사용한다.

```json
{
  "requestId": "job UUID",
  "requestKey": "업무 멱등 키",
  "jobType": "ORDER_COLLECT",
  "tenantId": "tenant identifier",
  "corpId": 1001,
  "userId": 2001,
  "sourceType": "SHOPPING_MALL",
  "sourceSystem": "COUPANG",
  "sourceAccountId": "external-account-id",
  "channelAccountId": 3001,
  "erpConnectionId": 4001,
  "parentJobId": null,
  "correlationId": "pipeline UUID",
  "causationId": null,
  "schemaVersion": "1.0",
  "payloadVersion": "1.0",
  "occurredAt": "2026-07-01T10:00:00Z",
  "traceContext": {},
  "payload": {}
}
```

필드 계약:

| 필드 | 계약 |
|---|---|
| `requestId` | Job 실행 인스턴스의 전역 고유 ID. 재시도는 동일 ID, 새 실행은 새 ID를 사용한다. |
| `requestKey` | 업무 단위 멱등 키. DB unique constraint 대상이다. |
| `jobType` | 중앙 관리되는 Job Type 값이다. |
| `tenantId` | canonical 고객사 식별자다. |
| `corpId` | 현재 DB 호환용 고객사 ID다. 전환 기간에는 선택 필드지만 둘 중 하나는 필수다. |
| `userId` | 요청자 또는 실행 주체. 스케줄/시스템 작업은 system actor를 사용한다. |
| `sourceType` | `SHOPPING_MALL`, `EXTERNAL_PLATFORM`, `CSV`, `WEBHOOK`, `ERP`, `INTERNAL` 중 하나다. |
| `sourceSystem` | `COUPANG`, `SABANGNET`, `PLAYAUTO`, `CSV`, ERP 제품 코드 등 실제 원천 시스템이다. |
| `sourceAccountId` | 외부 시스템 안의 계정 식별자다. |
| `channelAccountId` | Easy Hub 쇼핑몰 연결 계정 ID다. 해당하지 않으면 생략한다. |
| `erpConnectionId` | 고객사 ERP 연결 설정 ID다. ERP 단계에서 필수다. |
| `parentJobId` | 현재 Job을 직접 생성한 Job ID다. |
| `correlationId` | 하나의 주문 유입부터 ERP 반영까지 유지하는 파이프라인 ID다. |
| `causationId` | 현재 이벤트 발생의 직접 원인이 된 Job 또는 이벤트 ID다. 일반 후속 Job에서는 `parentJobId`와 같을 수 있다. |
| `schemaVersion` | 공통 envelope의 버전이다. |
| `payloadVersion` | 해당 Job Type payload의 버전이다. |
| `occurredAt` | Job 이벤트가 생성된 UTC 시각이다. |
| `traceContext` | 분산 추적 정보다. 업무 로직이나 멱등성 판단에는 사용하지 않는다. |
| `payload` | Job Type별 데이터다. 자격증명 원문은 포함하지 않고 연결 ID만 전달한다. |

필드 값은 envelope와 payload에 중복 저장하지 않는 것을 원칙으로 한다. 기존 payload 호환 기간에는 읽기를 지원하되 새 발행은 envelope를 기준으로 한다.

### 2.2 공통 validation

- `requestId`, `requestKey`, `jobType`, `correlationId`, `schemaVersion`, `payloadVersion`은 항상 필수다.
- `tenantId` 또는 `corpId` 중 하나 이상은 필수다.
- `sourceType`과 `sourceSystem`은 항상 필수다.
- Job Type별 필요한 account/connection 식별자를 별도 schema에서 검증한다.
- 알 수 없는 `schemaVersion` 또는 지원하지 않는 `payloadVersion`은 retry하지 않는 계약 오류로 분류한다.
- payload는 passthrough를 허용할 수 있지만, 핵심 필드는 strict validation하고 알 수 없는 필드는 로그로 관찰한다. 안정화 후 strict mode로 전환한다.

---

## 3. Job Type 명세

### 3.1 요약

| Job Type | 역할 | 정상 후속 Job | 기본 retry |
|---|---|---|---|
| `ORDER_COLLECT` | 쇼핑몰 API 직접 호출 | `ORDER_INGEST` | 가능 |
| `EXTERNAL_ORDER_IMPORT` | 외부 플랫폼/CSV/Webhook 입력 수신·검증 | `ORDER_INGEST` | 조건부 |
| `ORDER_INGEST` | Raw 영속화 및 유입 멱등 처리 | `ORDER_NORMALIZE` | 가능 |
| `ORDER_NORMALIZE` | 공통 주문 구조 변환 | `ERP_MAPPING` | 조건부 |
| `ERP_MAPPING` | 고객사 ERP 코드·필드 변환 | `ERP_APPLY` | 조건부 |
| `ERP_APPLY` | ERP에 주문 반영 | 없음 또는 결과 이벤트 | 가능 |
| `ERP_APPLY_RETRY` | 운영자가 지정한 ERP 반영 재실행 | 내부적으로 `ERP_APPLY` 실행 | 가능 |
| `ORDER_STATUS_SYNC` | 원천 주문 상태 조회 및 변경 유입 | `ORDER_INGEST` | 가능 |
| `DLQ_REPLAY` | DLQ 원본 검증 및 원 Job 복구 | 원래 `jobType` | 조건부 |

`ERP_APPLY_RETRY`는 별도 업무 단계라기보다 재처리 명령이다. 자동 retry는 원래 `ERP_APPLY` Job의 동일 `requestId`와 payload로 수행하고, 운영자 수동 재처리만 `ERP_APPLY_RETRY` 명령으로 기록한다.

### 3.2 ORDER_COLLECT

- 역할: Easy Hub가 쇼핑몰 API를 직접 호출하여 주문 또는 주문 변경 데이터를 가져온다.
- 필수 payload:
  - `channelAccountId`
  - `collectionMode`: `NEW_ORDER`, `CHANGED_ORDER`, `FULL`
  - `range.from`, `range.to`
  - 선택: `cursor`, `page`, `pageSize`, `scheduleRunId`
- 출력 결과:
  - 외부 호출 메타데이터
  - 수집 batch 또는 Raw 참조 정보
  - 주문 건수, 다음 cursor
- 다음 Job: 수집 batch별 `ORDER_INGEST`
- retry: timeout, network, 5xx, 429, 일시적 인증 갱신 실패에 가능
- retry 불가: 계정 비활성, 영구 인증 실패, 지원하지 않는 채널/요청 형식
- DLQ: retry 가능 오류가 최대 횟수를 초과하거나 기술적으로 처리 불가능한 응답이 반복될 때
- 멱등성: `tenantId + channelAccountId + collectionMode + range/cursor + scheduleRunId 또는 manualRequestId`

### 3.3 EXTERNAL_ORDER_IMPORT

- 역할: 사방넷, 플레이오토, CSV, Webhook 등 외부 입력을 인증하고 기본 형식과 소유권을 검증한다.
- 필수 payload:
  - `importType`: `API`, `WEBHOOK`, `CSV`
  - `sourceAccountId`
  - `externalEventId` 또는 `fileId + rowGroup`
  - `receivedAt`
  - `rawObjectRef` 또는 제한된 inline payload
  - 선택: `signatureId`, `fileName`, `contentHash`
- 출력 결과: 검증된 import batch와 원본 위치, 수신 건수, 중복 여부
- 다음 Job: `ORDER_INGEST`
- retry: 파일 저장소/DB/내부 서비스 장애에는 가능. 서명 오류나 형식 오류에는 불가
- DLQ: 수신 확인 후 비동기 처리 중 기술 오류가 반복될 때. 인증 실패 요청은 DLQ가 아니라 보안 감사 로그 대상이다.
- 멱등성: `tenantId + sourceSystem + sourceAccountId + externalEventId`; CSV는 `tenantId + contentHash + rowGroup`

### 3.4 ORDER_INGEST

- 역할: 입력 경로와 무관하게 Raw 주문 이벤트를 영속화하고, Raw ID를 기준으로 후속 파이프라인을 시작한다.
- 필수 payload:
  - `ingestBatchId`
  - `rawObjectRef` 또는 `rawItems`
  - `sourceEventId`
  - `sourceOccurredAt`
  - `ingestMode`: `SNAPSHOT`, `DELTA`, `STATUS_CHANGE`
  - `contentHash`
- 출력 결과:
  - `rawBatchId`
  - `rawOrderIds`
  - inserted/duplicate/rejected 건수
- 다음 Job: 신규 또는 변경 Raw가 있을 때 `ORDER_NORMALIZE`
- retry: DB/스토리지 등 기술 오류에 가능
- retry 불가: tenant/account 불일치, 지원하지 않는 Raw 계약, 필수 주문 식별자 부재
- DLQ: 기술 오류 최대 횟수 초과 또는 계약 오류를 운영 확인 대상으로 보존할 때
- 멱등성: `tenantId + sourceSystem + sourceAccountId + sourceEventId`; 이벤트 ID가 없으면 canonical raw의 `contentHash`

### 3.5 ORDER_NORMALIZE

- 역할: Raw 주문을 Easy Hub 공통 주문, 품목, 배송, 상태 구조로 변환한다.
- 필수 payload:
  - `rawBatchId` 또는 `rawOrderIds`
  - `normalizerCode`
  - `normalizerVersion`
  - `targetSchemaVersion`
- 출력 결과:
  - `normalizedBatchId`
  - `normalizedOrderIds`
  - normalized/skipped/rejected 건수
  - 주문별 validation 결과
- 다음 Job: ERP 연결이 설정된 주문에 `ERP_MAPPING`
- retry: DB 장애, 일시적 참조 데이터 조회 실패에는 가능
- retry 불가: mapping 코드 결함이 아닌 확정적 schema/필수값 오류. 이 경우 주문별 reject로 저장한다.
- DLQ: Job 자체 실행이 반복 실패하거나 모든 주문이 처리 불가능한 계약 오류일 때
- 멱등성: `rawOrderId + normalizerVersion + targetSchemaVersion`; 현재 상태 upsert 키는 `tenantId + sourceAccount + sourceOrderId`

### 3.6 ERP_MAPPING

- 역할: 정규화 주문을 고객사 ERP의 코드, 필드, 단위, 세금, 창고 및 거래처 규칙에 맞게 변환하고 전송 가능한 snapshot을 만든다.
- 필수 payload:
  - `normalizedOrderIds` 또는 `normalizedBatchId`
  - `erpConnectionId`
  - `mappingProfileId`
  - `mappingProfileVersion`
  - `operation`: `CREATE`, `UPDATE`, `CANCEL`, `STATUS_UPDATE`
- 출력 결과:
  - immutable `erpPayloadSnapshotId`
  - 주문별 validation 결과와 mapping 오류
- 다음 Job: 전송 가능한 snapshot에 대해 `ERP_APPLY`
- retry: 참조 코드 서비스/DB 장애에는 가능
- retry 불가: 상품 코드 미매핑, 필수 ERP 코드 부재, 업무 규칙 위반
- DLQ: 기술 오류 최대 횟수 초과. 업무 매핑 오류는 DLQ보다 `MAPPING_REQUIRED` 상태와 운영 보정 큐로 보낸다.
- 멱등성: `normalizedOrderVersion + erpConnectionId + mappingProfileVersion + operation`

### 3.7 ERP_APPLY

- 역할: 고정된 ERP payload snapshot을 ERP에 전송하고 주문별 반영 결과를 기록한다.
- 필수 payload:
  - `erpConnectionId`
  - `erpPayloadSnapshotId`
  - `operation`
  - `idempotencyKey`
  - 선택: `expectedRemoteVersion`
- 출력 결과:
  - 성공/실패/부분 성공
  - ERP 문서번호와 원격 식별자
  - 요청/응답 참조, 반영 시각
  - 주문별 오류 코드와 retry 가능 여부
- 다음 Job: 기본적으로 없음. 상태 확인이 필요한 ERP는 확인 Job을 별도 확장한다.
- retry: network, timeout, 5xx, 429, ERP busy/lock에 가능
- retry 불가: ERP validation, 마감, 권한, 코드 불일치 등 확정 업무 오류
- DLQ: 결과 확인이 불가능한 기술 오류가 최대 횟수를 넘었을 때. timeout 후 결과 불명은 즉시 재전송하지 않고 `UNKNOWN` 확인 절차를 거친다.
- 멱등성: `tenantId + erpConnectionId + sourceOrderId + operation + businessVersion`. ERP가 idempotency key를 지원하면 동일 값을 헤더/필드로 전달하고, 미지원 ERP는 Hub 전송 ledger와 원격 조회로 방어한다.

### 3.8 ERP_APPLY_RETRY

- 역할: 업무 오류가 보정되었거나 운영자가 승인한 ERP 반영을 해당 단계부터 재실행한다.
- 필수 payload:
  - `originalApplyJobId`
  - `erpApplyAttemptId`
  - `retryReason`
  - `requestedBy`
  - `reuseSnapshot`: boolean
  - 선택: 새 `erpPayloadSnapshotId`
- 출력 결과: 생성 또는 재활성화된 `ERP_APPLY` 실행 참조
- 다음 Job: 원래 snapshot을 사용할 수 있으면 `ERP_APPLY`; mapping이 바뀌었으면 먼저 `ERP_MAPPING`
- retry: 명령 처리의 기술 오류에는 가능
- retry 불가: 원 주문/ERP 연결 소유권 불일치, 이미 성공한 동일 business version
- DLQ: 재처리 명령 자체의 기술 오류가 반복될 때
- 멱등성: `originalApplyJobId + retryCommandId`; 실제 ERP 멱등 키는 원 operation의 business idempotency key를 유지한다.

### 3.9 ORDER_STATUS_SYNC

- 역할: 쇼핑몰 또는 외부 플랫폼에서 취소, 반품, 배송 등 기존 주문 상태 변경을 조회한다.
- 필수 payload:
  - `channelAccountId` 또는 `sourceAccountId`
  - `statusTypes`
  - `range.from`, `range.to` 또는 `cursor`
  - `syncCheckpointId`
- 출력 결과: 상태 변경 Raw batch, 다음 checkpoint
- 다음 Job: `ORDER_INGEST`
- retry: `ORDER_COLLECT`와 동일한 기술 오류에 가능
- retry 불가: 잘못된 계정/상태 유형/영구 인증 실패
- DLQ: 최대 retry 초과
- 멱등성: `tenantId + source account + statusTypes + checkpoint/range`

### 3.10 DLQ_REPLAY

- 역할: DLQ 저장 레코드를 검증하고 원래 Job Type과 payload로 재실행 가능 상태를 만든다.
- 필수 payload:
  - `dlqRecordId`
  - `originalJobId`
  - `replayCommandId`
  - `requestedBy`
  - `reason`
  - 선택: 승인된 payload migration 정보
- 출력 결과: replay된 원 Job ID/attempt 및 발행 Outbox ID
- 다음 Job: 원래 `jobType`; `DLQ_REPLAY` 자체가 업무 파이프라인 다음 단계가 되지는 않는다.
- retry: DB/Outbox 등 기술 오류에 가능
- retry 불가: 원본 없음, tenant 불일치, 지원하지 않는 payload version, 이미 성공한 업무 버전
- DLQ: replay orchestration 자체가 반복 실패하면 별도 운영 오류 큐에 기록한다. DLQ의 DLQ를 무한 생성하지 않는다.
- 멱등성: `dlqRecordId + replayCommandId`; 동일 명령은 한 번만 원 Job을 활성화한다.

---

## 4. Parent, Correlation, Causation 계약

### 4.1 의미

- `parentJobId`: 실행 트리에서 직전 상위 Job이다. 조회와 단계별 진행률 계산에 사용한다.
- `correlationId`: 하나의 업무 파이프라인 전체에서 변하지 않는다. 최초 진입 Job이 생성하며 이후 모든 Job이 상속한다.
- `causationId`: 현재 Job 생성을 직접 유발한 Job 또는 외부 이벤트 ID다. fan-out/fan-in과 재처리 원인을 표현한다.

일반적인 1:1 후속 Job에서는 `parentJobId == causationId`다. 한 수집 Job이 여러 ingest batch를 만들거나 한 normalize batch가 ERP 연결별로 fan-out되는 경우 각 자식은 같은 parent를 갖되 독립 `requestId`를 가진다.

### 4.2 직접 수집 예시

```text
J1 ORDER_COLLECT
  parentJobId = null
  correlationId = C1
  causationId = null

J2 ORDER_INGEST
  parentJobId = J1
  correlationId = C1
  causationId = J1

J3 ORDER_NORMALIZE
  parentJobId = J2
  correlationId = C1
  causationId = J2

J4 ERP_MAPPING
  parentJobId = J3
  correlationId = C1
  causationId = J3

J5 ERP_APPLY
  parentJobId = J4
  correlationId = C1
  causationId = J4
```

### 4.3 외부 플랫폼 예시

```text
J10 EXTERNAL_ORDER_IMPORT
  correlationId = C2
  causationId = externalEventId

J11 ORDER_INGEST
  parentJobId = J10
  correlationId = C2
  causationId = J10

J12 ORDER_NORMALIZE
  parentJobId = J11
  correlationId = C2
  causationId = J11

J13 ERP_MAPPING
  parentJobId = J12
  correlationId = C2
  causationId = J12

J14 ERP_APPLY
  parentJobId = J13
  correlationId = C2
  causationId = J13
```

### 4.4 retry와 replay

- 자동 retry는 같은 Job의 동일 `requestId`, `parentJobId`, `correlationId`, `causationId`를 유지하고 attempt만 증가시킨다.
- 수동 재처리 명령은 새 command Job ID를 갖는다.
- 재처리로 새 실행 Job을 만들 경우 새 `requestId`를 부여하되 `correlationId`는 유지하고 `causationId`는 retry/replay command ID로 설정한다.
- 기존 `NORMALIZE_{requestId}` 규칙은 호환용 `requestKey` 생성에만 제한적으로 유지하고 관계 조회에는 사용하지 않는다.

---

## 5. Kafka Key 정책

### 5.1 원칙

Kafka key는 Job Type이 아니라 순서와 동시성을 공유해야 하는 외부 자원을 식별한다.

| 자원 | Kafka key |
|---|---|
| 쇼핑몰 계정 | `tenant:{tenantId}:channel-account:{channelAccountId}` |
| 외부 플랫폼 계정 | `tenant:{tenantId}:source:{sourceSystem}:account:{sourceAccountId}` |
| ERP 연결 | `tenant:{tenantId}:erp-connection:{erpConnectionId}` |
| 계정 없는 파일 import | `tenant:{tenantId}:import-file:{fileId}` |
| 식별 불가능한 poison message | 원 Kafka partition/offset를 보존한 quarantine key |

이에 따라 같은 쇼핑몰 계정의 `ORDER_COLLECT`와 `ORDER_STATUS_SYNC`는 Job Type이 달라도 동일 파티션으로 간다. 서로 다른 채널 계정과 ERP 연결은 병렬 처리된다.

### 5.2 단계별 선택

- `ORDER_COLLECT`, 쇼핑몰 기반 `ORDER_INGEST`: channel account key
- `EXTERNAL_ORDER_IMPORT`, 외부 플랫폼 기반 `ORDER_INGEST`: source account key
- `ORDER_STATUS_SYNC`: 실제 상태를 조회하는 source account key
- `ERP_MAPPING`, `ERP_APPLY`: ERP connection key
- `DLQ_REPLAY`: 원 Job의 key를 그대로 복원

### 5.3 ORDER_NORMALIZE 검토 결과

`requestId` key는 동일 계정 주문들의 순서를 보장하지 못한다. 기본 key를 원천 계정 key로 변경하는 것을 권장한다.

- 동일 주문의 이벤트 순서가 중요하면 `tenant + sourceSystem + sourceAccountId`를 기본으로 한다.
- 한 계정의 처리량이 매우 커져 병렬화가 필요하면 `account key + stable shard(sourceOrderId hash % N)`를 사용한다.
- shard 수 변경은 순서 보장을 깨므로 버전이 있는 고정 shard 정책으로 관리한다.
- ERP 단계는 정규화 key와 무관하게 ERP connection key로 repartition한다.

Key 생성기는 API, Worker, Outbox Publisher, DLQ Replay가 공유하는 단일 계약으로 구현해야 한다. Outbox에 계산된 `partition_key`를 저장하고 Publisher는 재계산하지 않고 그 값을 사용한다.

---

## 6. Lock Key 정책

### 6.1 자원 기반 Lock

| 보호 자원 | Lock key | 적용 Job |
|---|---|---|
| 쇼핑몰 연결 계정 | `channel-account:{tenantId}:{channelAccountId}` | `ORDER_COLLECT`, `ORDER_STATUS_SYNC` |
| 외부 플랫폼 계정 | `source-account:{tenantId}:{sourceSystem}:{sourceAccountId}` | `EXTERNAL_ORDER_IMPORT`의 pull/import orchestration |
| ERP 연결 | `erp-connection:{tenantId}:{erpConnectionId}` | `ERP_APPLY` |
| ERP 주문 operation | `erp-operation:{erpConnectionId}:{businessIdempotencyKey}` | 동일 주문 중복 전송 방어 |

Kafka partition은 정상적인 순서 제어 수단이고 DB lock은 Recovery, replay, 다중 진입 경로를 막는 최종 방어선이다.

### 6.2 Lock 충돌 처리

Lock 충돌은 업무 실패로 기록하지 않는다.

```text
PROCESSING -> WAITING_LOCK
WAITING_LOCK -> QUEUED 또는 PROCESSING
```

- `next_attempt_at`을 짧은 jitter backoff로 설정한다.
- retry count와 lock wait count를 분리한다.
- Lock 대기는 최대 업무 retry 횟수를 소모하지 않는다.
- 장기 대기는 경고 및 운영 지표로 노출하되 DLQ로 바로 보내지 않는다.

### 6.3 TTL, heartbeat, fenced lock

단순 TTL만 사용하면 장시간 API 호출 중 Lock이 만료되어 두 Worker가 동시에 외부 자원을 변경할 수 있다. 다음 구조를 권장한다.

- Lock 획득 시 단조 증가하는 `fencingToken` 발급
- 처리 중 주기적인 heartbeat로 `expiresAt` 연장
- heartbeat 실패 또는 소유권 변경 감지 시 Worker가 후속 외부 호출과 성공 commit을 중단
- release는 `lockKey + ownerId + fencingToken`이 모두 일치할 때만 수행
- ERP adapter가 지원하면 fencing token 또는 idempotency key를 외부 요청에도 전달

ERP 중복 전송 방지는 account lock만으로 충분하지 않으므로 operation 멱등 ledger를 함께 사용한다.

---

## 7. 단계별 멱등성 정책

### 7.1 수집 요청

- 수동: `tenant + channelAccountId + collectionMode + from/to + clientRequestId`
- 스케줄: `scheduleRunId + channelAccountId + window`
- cursor: `channelAccountId + collectionMode + cursor`
- DB unique constraint로 최초 Job만 생성한다.

동일 기간 재수집을 의도한 경우 새로운 `clientRequestId` 또는 명시적인 `forceRunId`를 사용하되 Raw/정규화 멱등성은 계속 적용한다.

### 7.2 외부 플랫폼 이벤트 수신

- 1순위: 플랫폼이 제공한 immutable `externalEventId`
- 2순위: `sourceAccountId + sourceOrderId + eventType + sourceVersion`
- 최후 수단: canonicalized body의 SHA-256 content hash
- 동일 이벤트의 HTTP 재전송에는 이전 수신 결과를 반환한다.

### 7.3 Raw 저장

- `tenant + sourceSystem + sourceAccountId + sourceEventId`
- 주문 단위로는 `sourceOrderId + eventType + sourceVersion/contentHash`
- Raw는 immutable append를 원칙으로 하고 중복 event는 기존 Raw ID를 반환한다.
- 원문, content hash, schema version, 수신 시각, source occurred time을 보존한다.

### 7.4 정규화

- `rawOrderId + normalizerVersion + targetSchemaVersion`으로 결과 snapshot을 식별한다.
- 현재 주문 projection은 `tenant + source account + sourceOrderId`로 upsert한다.
- 동일 source version보다 오래된 이벤트는 현재 projection을 덮어쓰지 않는다.
- 품목 삭제/변경은 snapshot 교체 또는 source version 기준 reconciliation로 stale 데이터를 남기지 않는다.

### 7.5 ERP 반영

- 업무 멱등 키: `tenant + erpConnectionId + sourceOrderId + operation + businessVersion`
- ERP 요청 전에 attempt ledger를 원자적으로 생성한다.
- 성공한 동일 key는 재전송하지 않고 기존 성공 결과를 반환한다.
- timeout으로 결과가 불명확하면 `UNKNOWN`으로 두고 ERP 조회 후 성공/재전송을 결정한다.
- mapping 변경으로 payload가 달라지면 business version 또는 operation version을 증가시킨다.

### 7.6 DLQ Replay

- `dlqRecordId + replayCommandId` unique
- 원 Job이 이미 성공했거나 동일 business idempotency key가 ERP 성공이면 재전송하지 않는다.
- 원 payload를 보존하며, 버전 migration은 승인된 변환기와 변환 이력을 남긴 경우에만 허용한다.
- replay 횟수와 직전 replay 결과를 저장한다.

---

## 8. 상태 모델

### 8.1 Job 상태

```text
CREATED -> QUEUED -> PROCESSING -> SUCCESS
                     |    |
                     |    +-> RETRY_WAIT -> QUEUED
                     +------> WAITING_LOCK -> QUEUED
                     +------> FAILED -> DLQ_PENDING -> DLQ
                     +------> CANCELLED
```

권장 상태:

- `CREATED`: Job과 Outbox를 생성 중인 내부 상태. 트랜잭션 밖에서는 보이지 않아도 된다.
- `QUEUED`: 실행 가능하며 Outbox 발행 전/후를 모두 포함한다.
- `PROCESSING`: Worker가 claim했다.
- `WAITING_LOCK`: 자원 Lock을 기다린다.
- `RETRY_WAIT`: 기술 오류 backoff 중이다.
- `SUCCESS`: 해당 Job의 업무 처리가 완료됐다.
- `FAILED`: 더 이상 자동 retry하지 않는다.
- `DLQ_PENDING`: DLQ 영속화/발행 대기 상태다.
- `DLQ`: 운영 개입 대상으로 안전하게 보존됐다.
- `CANCELLED`: 명시적으로 중단됐다.

`QUEUED`와 Kafka 발행 여부는 같은 의미가 아니다. 발행 상태는 Outbox에서 별도로 관리한다.

### 8.2 주문 파이프라인 상태

주문 또는 주문 version별 projection에 다음 상태를 둔다.

```text
RECEIVED
RAW_STORED
NORMALIZE_PENDING
NORMALIZED
MAPPING_REQUIRED
MAPPED
ERP_APPLY_PENDING
ERP_APPLIED
PARTIALLY_APPLIED
FAILED
```

Job 상태를 집계해 즉석 계산만 하지 않고 주문 파이프라인 상태를 별도로 저장한다. 한 Job이 여러 주문을 포함하고 주문별 결과가 다를 수 있기 때문이다.

### 8.3 ERP 반영 상태

- `NOT_REQUESTED`
- `MAPPING_PENDING`
- `MAPPING_FAILED`
- `READY`
- `APPLYING`
- `APPLIED`
- `RETRY_WAIT`
- `BUSINESS_REJECTED`
- `UNKNOWN`
- `PARTIAL_SUCCESS`
- `DEAD`

ERP 반영 상태는 `erpConnectionId + normalizedOrderVersion + operation` 단위로 저장한다. 하나의 주문이 여러 ERP 연결에 전달될 수 있으므로 주문 테이블의 단일 컬럼으로만 관리하지 않는다.

### 8.4 실패 정보

공통 실패 레코드에는 다음을 저장한다.

- `failedStage`: `COLLECT`, `IMPORT`, `INGEST`, `NORMALIZE`, `MAPPING`, `ERP_APPLY`, `STATUS_SYNC`, `PUBLISH`, `PARSE`
- `errorCategory`: `TECHNICAL`, `BUSINESS`, `CONTRACT`, `AUTH`, `RATE_LIMIT`, `LOCK`, `UNKNOWN_RESULT`
- `errorCode`, `errorMessage`
- `retryable`
- `retryFromJobType`
- `failedPayloadRef`
- `firstFailedAt`, `lastFailedAt`, `attemptCount`

ERP만 실패한 주문은 `ERP_APPLY` 또는 필요 시 `ERP_MAPPING`부터 재처리한다. `ORDER_COLLECT`, Raw 저장, 정규화는 다시 실행하지 않는다.

---

## 9. 후속 Job과 Outbox 발행 정책

### 9.1 원자적 생성

각 Handler는 성공 시 다음 작업을 하나의 DB 트랜잭션으로 처리한다.

1. 현재 단계의 업무 결과 저장
2. 현재 Job을 `SUCCESS`로 전이
3. 후속 `hub_job` 생성
4. 후속 Job 메시지용 `hub_job_outbox` 생성
5. commit

Kafka 발행은 commit 이후 공통 Outbox Publisher가 담당한다. Handler는 Kafka Producer를 직접 호출하지 않는다.

후속 Job이 여러 개면 각 child Job과 Outbox를 같은 트랜잭션에 생성한다. `requestKey` unique와 Outbox의 `jobId/eventType` unique로 중복 child 발행을 방지한다.

### 9.2 API와 Worker 공유

- API는 최초 Job과 Outbox를 생성한다.
- Worker는 후속 Job과 Outbox를 생성한다.
- 둘 다 같은 `JobCommandService` 또는 DB port 계약을 사용한다.
- 공통 Outbox Publisher만 Kafka를 발행한다.
- Publisher는 Outbox에 저장된 topic, partition key, payload를 그대로 사용한다.

`ERP_APPLY`도 `ERP_MAPPING` 결과 저장 트랜잭션에서 Job과 Outbox를 함께 생성한다.

### 9.3 Job SUCCESS와 Outbox SENT

- 현재 Job `SUCCESS`: 현재 단계의 업무 결과와 후속 Job/Outbox 생성이 DB에 안전하게 commit됨
- 후속 Outbox `SENT`: 후속 Job 메시지가 Kafka broker에 acknowledge됨
- 후속 Job `SUCCESS`: 후속 단계의 실제 업무 처리가 완료됨

따라서 `ORDER_NORMALIZE SUCCESS`는 ERP 반영 성공을 뜻하지 않는다. 또한 child Outbox가 아직 `PENDING`이어도 부모 Job은 성공할 수 있다.

### 9.4 발행 Recovery

- Outbox `PENDING`과 retry 시각이 지난 레코드를 주기적으로 claim한다.
- 오래된 `PUBLISHING`은 lease 만료 후 다시 claim한다.
- broker 실패는 Outbox retry count와 backoff로 처리한다.
- 최대 실패 후 Outbox를 즉시 버리지 않고 `FAILED`로 보존하며 운영 경보와 수동 replay를 제공한다.
- Job Recovery는 `QUEUED`인데 Outbox가 없거나 실패한 불일치를 탐지해, 결정론적으로 메시지를 재생성할 수 있을 때 Outbox를 복구한다.
- Outbox `SENT` 후 Worker 수신 전 장애는 Kafka가 보장하고, 중복 발행은 Job claim과 업무 멱등 키가 방어한다.

---

## 10. Retry, DLQ, Replay 정책

### 10.1 일반화된 retry

- retry는 원래 `jobType`, envelope, payload, key를 유지한다.
- 자동 retry는 DB 상태와 `nextAttemptAt`만 갱신하고 attempt history를 추가한다.
- Recovery는 저장된 Job을 Job Type별 현재 schema로 검증한 뒤 동일 Handler로 전달한다.
- 원 payload를 임의로 다시 조립하지 않는다.
- payload migration이 필요하면 버전이 명시된 migration 단계를 거친다.

### 10.2 오류 분류

| 오류 | 예 | 정책 |
|---|---|---|
| 일시적 기술 오류 | timeout, network, 5xx, DB unavailable | exponential backoff + jitter |
| rate limit | HTTP 429 | `Retry-After` 우선, 없으면 정책 backoff |
| Lock 충돌 | 동일 외부 자원 작업 중 | `WAITING_LOCK`, retry count 미소모 |
| 인증 일시 오류 | token refresh 실패 | 제한된 retry |
| 영구 인증/권한 | revoked credential, 401/403 확정 | 업무 실패, 운영 조치 |
| 계약 오류 | schema/version/필수 필드 오류 | retry 불가 |
| 업무 오류 | ERP 코드 미매핑, 마감, validation | 자동 retry 불가, 보정 후 단계 재처리 |
| 결과 불명 | ERP timeout 후 반영 여부 불명 | `UNKNOWN`, 원격 조회 후 결정 |

HTTP 4xx를 일괄 non-retry로 처리하지 않는다. 408, 409의 일부, 423, 425, 429 등은 adapter별 정책으로 분류한다.

### 10.3 DLQ 저장

Kafka DLQ만을 유일 저장소로 사용하지 않는다. 먼저 DB `dead_letter_record`에 다음을 영속화한 뒤 Outbox로 DLQ topic에 발행한다.

- 원 topic/partition/offset/key
- raw message bytes 또는 object storage 참조
- 파싱 가능 시 원 Job envelope
- parse/validation/handler 오류
- 원 Job ID와 correlation ID
- retry/attempt 정보
- DLQ publish 상태

이 구조로 DLQ Kafka 발행 자체가 실패해도 DB Recovery가 다시 발행할 수 있다.

### 10.4 파싱 실패

- JSON 파싱 실패 메시지도 commit 전에 quarantine/dead-letter DB에 저장한다.
- 원본 bytes, Kafka 위치, consumer 정보, 오류를 보존한다.
- 저장에 실패하면 offset을 정상 처리로 확정하지 않고 consumer를 중단하거나 재시도하여 유실을 막는다.
- schema validation 실패는 지원하지 않는 버전인지 손상 메시지인지 구분한다.

### 10.5 DLQ replay

1. `DLQ_REPLAY` 명령 저장
2. tenant 및 권한 검증
3. 원 envelope와 payload version 검증
4. 필요 시 승인된 migration 적용
5. 원래 `jobType`, payload, resource key 복원
6. 원 Job을 재활성화하거나 새 attempt Job 생성
7. Job과 Outbox를 한 트랜잭션으로 저장
8. replay 결과와 원 DLQ record 연결

이미 성공한 ERP business idempotency key는 replay해도 외부 전송하지 않는다.

---

## 11. 단계적 적용 순서

### 단계 1: 현재 Job 계약 가시화와 호환 필드 추가

- 중앙 Job Type 정의와 Job Type별 schema registry를 만든다.
- `hub_job`에 parent/correlation/causation 및 schema/payload version 필드를 추가한다.
- 기존 `ORDER_COLLECT`, `ORDER_NORMALIZE` 메시지를 새 envelope로 감싸되 구 payload 읽기를 유지한다.
- 현재 흐름을 깨지 않도록 contract test를 먼저 추가한다.

효과: 이후 모든 확장의 공통 기반이며 기존 기능 영향이 가장 작다.

### 단계 2: 후속 Job Outbox 통일

- Worker의 `ORDER_NORMALIZE` 직접 Kafka 발행을 제거하고 child Job + Outbox 원자 저장으로 전환한다.
- API와 Worker가 공통 Job/Outbox 생성 서비스를 사용한다.
- Outbox 저장 key를 Publisher가 그대로 사용하게 한다.
- DB insert 성공/Kafka 실패 통합 테스트를 추가한다.

효과: ERP 단계 추가 전에 메시지 유실 간극을 제거한다.

### 단계 3: Retry/Replay 일반화

- `retryJob()`의 `ORDER_COLLECT` 하드코딩을 제거한다.
- 저장된 원 envelope/payload/jobType을 그대로 재사용한다.
- `RETRY_WAIT`, `WAITING_LOCK`, attempt history를 도입한다.
- 429, 업무 오류, 계약 오류, 결과 불명 분류를 추가한다.

효과: 모든 신규 Job이 동일한 복구 체계를 재사용한다.

### 단계 4: 자원 기반 key와 fenced lock

- resource key resolver를 단일 모듈로 만든다.
- `ORDER_COLLECT`와 `ORDER_STATUS_SYNC`가 같은 channel account key/lock을 사용하게 한다.
- Lock heartbeat, owner, fencing token을 추가한다.
- Lock 충돌을 실패가 아닌 대기 상태로 변경한다.

효과: 상태 동기화와 ERP 병렬 처리를 안전하게 추가할 수 있다.

### 단계 5: ORDER_INGEST와 Raw 모델 분리

- 현재 `hub_job_result` 보존을 유지하며 별도 immutable Raw batch/order event 모델을 추가한다.
- 기존 수집 Handler 결과가 `ORDER_INGEST`로 들어가게 adapter를 둔다.
- content hash, source event ID, raw schema version을 저장한다.
- 정규화 입력을 `hub_job_result`에서 Raw ID로 단계적으로 전환한다.

효과: 직접 수집과 외부 수신이 같은 파이프라인으로 합쳐진다.

### 단계 6: ERP_MAPPING과 ERP_APPLY 추가

- 먼저 mock ERP adapter로 Job, mapping snapshot, apply ledger를 검증한다.
- ERP 연결 key, operation 멱등 키, UNKNOWN 상태를 구현한다.
- 정규화 성공 후 `ERP_MAPPING`, mapping 성공 후 `ERP_APPLY`를 Outbox로 발행한다.
- ERP 실패만 단계 재처리하는 통합 테스트를 만든다.

효과: 쇼핑몰 재수집 없이 ERP 단계만 안전하게 재처리할 수 있다.

### 단계 7: 외부 플랫폼 수신

- Webhook/API 인증과 external event 멱등성을 구현한다.
- 사방넷/플레이오토 adapter는 `EXTERNAL_ORDER_IMPORT -> ORDER_INGEST` 계약만 충족하게 한다.
- CSV는 업로드 파일 hash와 행 단위 오류 결과를 제공한다.

효과: source adapter만 추가해 공통 Raw/정규화/ERP 파이프라인을 재사용한다.

### 단계 8: ORDER_STATUS_SYNC와 운영 기능

- 상태별 checkpoint와 delta ingest를 추가한다.
- 주문별 pipeline/ERP 상태 화면과 단계 재처리를 제공한다.
- persistent DLQ, poison message, Outbox 불일치 Recovery 및 운영 경보를 완성한다.

---

## 12. 테스트 기준

각 단계는 최소 다음 계약 테스트를 통과해야 한다.

- 동일 `requestKey` 동시 요청이 Job을 한 번만 만든다.
- child Job과 Outbox는 둘 다 commit되거나 둘 다 rollback된다.
- Outbox 중복 발행에도 Handler 업무 결과가 중복되지 않는다.
- 같은 resource key의 작업은 직렬화되고 다른 resource key는 병렬 처리된다.
- Lock TTL 중 heartbeat와 fencing token이 이중 실행을 막는다.
- ERP timeout 후 `UNKNOWN` 상태에서는 즉시 중복 전송하지 않는다.
- ERP 실패 replay가 `ORDER_COLLECT`를 다시 호출하지 않는다.
- DLQ replay는 원 `jobType`, payload, key, correlation을 복원한다.
- Kafka 파싱 실패도 원문과 위치가 영속화된다.
- 구 버전 `ORDER_COLLECT`/`ORDER_NORMALIZE` 메시지를 호환 기간 동안 처리한다.

---

## 13. 바로 다음 코드 수정 작업 3개

1. **Job envelope 및 관계 필드 도입**  
   `hub_job`에 `parent_job_id`, `correlation_id`, `causation_id`, `schema_version`, `payload_version`을 추가하고, `ORDER_COLLECT`와 `ORDER_NORMALIZE` 생성 시 이를 채운다. 구 payload 호환 parser와 contract test를 함께 만든다.

2. **ORDER_NORMALIZE 후속 발행을 Outbox로 전환**  
   수집 성공 처리, `ORDER_NORMALIZE` child Job 생성, Outbox 저장을 한 트랜잭션으로 묶고 Worker의 직접 Kafka publisher를 제거한다. API와 Worker가 같은 Outbox 계약을 사용하도록 한다.

3. **Job Type 독립적인 retry/replay 기반 구현**  
   수동 retry의 `ORDER_COLLECT` 하드코딩과 payload 재조립을 제거하고, 저장된 원 `jobType`과 원 payload를 Job Type별 schema로 검증해 재발행한다. 429, Lock 충돌, 업무 오류를 각각 `RETRY_WAIT`, `WAITING_LOCK`, non-retryable failure로 분리한다.
