# Job 처리 권한 Fencing

## 목적

멀티 Worker와 Recovery 환경에서 이전 처리 시도(stale attempt)가 현재 처리자의 결과를 덮어쓰지 못하도록 Job 처리 권한을 DB에서 검증한다. Kafka consumer group, QUEUED 조건부 claim, SKIP LOCKED, hub_job_lock, Retry, DLQ, Outbox 구조는 그대로 유지한다.

## 현재 처리 흐름

1. Kafka consumer 또는 Recovery가 Job을 받는다.
2. 일반 consumer는 `QUEUED -> PROCESSING` 조건부 UPDATE로 claim한다.
3. Recovery는 `FOR UPDATE SKIP LOCKED`로 대상 row를 고른 뒤 새 attempt를 발급한다.
4. claim 성공 결과로 `JobExecutionToken`을 발급한다.
5. 핸들러와 외부 API 호출은 claim 트랜잭션 밖에서 실행한다.
6. SUCCESS, RETRY, FAILED 및 주요 결과 저장 시 실행 토큰을 다시 검증한다.
7. 조건 불일치는 `STALE_JOB_ATTEMPT_REJECTED`로 기록하고 Job을 추가로 실패 처리하거나 DLQ로 보내지 않는다.

## 실행 토큰

`hub_job`에는 다음 컬럼이 추가된다.

| 컬럼 | 역할 |
|---|---|
| `processing_attempt_id UUID` | 처리 시도마다 새로 발급되는 식별자 |
| `claimed_by VARCHAR(120)` | 현재 처리 권한을 가진 Worker ID |
| `lease_until TIMESTAMPTZ` | Recovery가 새 시도를 발급할 수 있는 시각 |
| `processing_started_at TIMESTAMPTZ` | 현재 시도의 시작 시각 |
| `fencing_token BIGINT` | claim/reclaim마다 증가하는 단조 증가 토큰 |

Worker의 `JobExecutionToken`은 requestId, attemptId, workerId, fencingToken, leaseUntil을 함께 가진다. 완료와 실패 전이는 이 값 전체가 현재 DB 값과 일치할 때만 성공한다.

## Claim과 Recovery

일반 claim은 `status='QUEUED'` 조건을 유지한다. 먼저 UPDATE한 Worker만 토큰을 받고 나머지는 기존 `JOB_PROCESSING_SKIPPED` 흐름으로 종료한다.

Zombie Recovery는 `lease_until <= NOW()`인 PROCESSING Job을 `FOR UPDATE SKIP LOCKED`로 claim한다. 기존 migration 이전 데이터처럼 lease가 없는 row는 기존 기준인 updated_at 30분 경과를 fallback으로 사용한다. Recovery claim은 새 attempt ID를 만들고 fencing token을 1 증가시킨다.

기본 lease는 `JOB_LEASE_MINUTES=30`이다. 이번 단계에는 heartbeat 연장을 구현하지 않았다.

## hub_job_lock과의 차이

`hub_job_lock`은 채널 계정이나 ERP 연결처럼 여러 Job이 공유하는 외부 자원의 동시 사용을 줄인다. 실행 토큰은 특정 Job 한 건의 현재 처리 권한자를 식별한다. 두 기능은 대체 관계가 아니며 함께 사용한다.

## 보장 범위

Fencing으로 방어하는 항목:

- stale Worker의 hub_job SUCCESS/RETRY/FAILED 덮어쓰기
- Recovery 이후 이전 attempt의 완료 처리
- 잘못된 attemptId, workerId, fencingToken의 상태 변경
- stale attempt의 hub_job_result 저장
- stale ERP_APPLY attempt의 ERP 결과 테이블 저장

별도 멱등성이 필요한 항목:

- 이미 외부 ERP가 처리한 API 요청
- 이미 쇼핑몰에 전송된 API 요청과 외부 시스템의 취소
- 주문 정규화 테이블의 중복/갱신 정책
- Kafka 중복 메시지 자체
- 네트워크 단절 때문에 성공 여부를 알 수 없는 외부 요청

ERP 호출은 기존 idempotencyKey와 외부 ERP의 멱등성 지원을 함께 사용해야 한다. Fencing은 외부에서 이미 발생한 부수 효과를 취소하지 못한다.

## 트랜잭션 경계

Claim은 짧은 DB UPDATE로 끝나며 외부 API 호출은 claim 트랜잭션 안에서 실행하지 않는다. ORDER_COLLECT 결과, 부모 SUCCESS, ORDER_NORMALIZE child Job, child Outbox는 하나의 DB 트랜잭션에서 현재 토큰을 검증한다. ORDER_NORMALIZE 완료와 ERP_APPLY child/outbox 생성도 같은 방식이다. ERP 외부 호출 자체는 DB 트랜잭션 밖이며, 응답을 저장하기 직전에 현재 실행 토큰을 검증한다.

## 테스트

`postgres.fencing.integration.test.ts`가 PostgreSQL Testcontainers에서 다음을 검증한다.

- 동일 Job에 8개 Worker가 동시에 접근해 claim 1개만 성공
- lease 만료 후 Recovery가 새 attempt와 증가한 token 발급
- Worker A의 stale SUCCESS 거절, Worker B 결과만 반영
- 원래 Worker와 Recovery Worker의 완료 경합
- 잘못된 attemptId, workerId, fencingToken 거절
- 이미 SUCCESS인 Job 재완료 거절
- 유효한 RETRY와 FAILED, stale RETRY 거절

실행:

```bash
cd hub-worker
npx cross-env RUN_INTEGRATION_TESTS=true NODE_OPTIONS=--experimental-vm-modules jest --runInBand src/db/postgres.fencing.integration.test.ts
```

## 다음 단계 설계

### Heartbeat

먼저 Job 유형별 p95/p99 및 최대 처리 시간을 측정한다. 30분에 근접하거나 초과하는 ORDER_COLLECT와 ERP_APPLY부터 heartbeat 적용을 검토하고, CPU 위주이며 짧은 ORDER_NORMALIZE는 측정 결과로 결정한다.

초기 제안은 30분 lease에 5분 heartbeat, 성공 시 현재 시도에 한해 lease를 NOW()+30분으로 연장하는 방식이다. heartbeat UPDATE에도 requestId, attemptId, workerId, fencingToken 조건을 사용한다. 연속 2~3회 실패하거나 권한 조건이 0건이면 외부 호출을 새로 시작하지 않고, 가능한 핸들러는 중단 신호를 받아 종료하도록 설계한다. 실제 외부 요청 도중에는 즉시 취소가 불가능할 수 있다.

### Retry Jitter

기존 backoff를 유지하면서 다음 범위의 양의 jitter를 더한다.

- 1분 + 0~30초
- 5분 + 0~60초
- 15분 + 0~120초

난수 주입 함수를 분리해 경계값, 분포 범위, next_retry_at 계산을 단위 테스트한다. 여러 Job의 재시도 시각이 동일 초에 집중되지 않는 통합 테스트도 추가한다.

### 외부 API 동시성 제한

우선 키는 채널 계정별, ERP Connection별, 전체 Worker별로 나눈다. 프로세스 내부 Semaphore는 단일 인스턴스에서만 유효하므로 현재 단일 EC2 구성에서는 빠른 보호 수단으로 가치가 있지만, Worker를 여러 컨테이너/EC2로 늘리면 전역 제한이 되지 않는다. 멀티 인스턴스 단계에서는 PostgreSQL advisory lock/lease semaphore 또는 Redis 기반 분산 제한을 검토한다.


## 20260713.002 보완

- ERP_APPLY는 외부 ERP 호출 직전과 인증 갱신 후 재호출 직전에 현재 execution token을 검증한다. 검증 실패 시 외부 호출과 ERP 결과 저장을 하지 않는다.
- 외부 호출과 DB 검증 사이의 극히 짧은 경합은 남으므로 ERP idempotencyKey는 계속 필요하다. Fencing은 이미 외부 시스템에 전달된 요청을 취소하지 못한다.
- ORDER_NORMALIZE의 header/item/delivery/checkpoint 저장은 이제 현재 token으로 잠근 트랜잭션에서 child Job/outbox/SUCCESS와 함께 커밋된다. token 검증 또는 중간 저장 오류 시 전체 롤백된다.
- V20260713_002__backfill_processing_job_leases.sql은 기존 NULL lease PROCESSING row에 backfill 값을 부여하고 즉시 Recovery 대상이 되게 한다. 기본 Recovery는 lease_until만 사용하며 updated_at fallback을 사용하지 않는다.
- DB CHECK 제약은 PROCESSING row에 attempt ID, claimed worker, lease, 양수 fencing token을 요구한다.
