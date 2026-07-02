# Easy Hub 현재 주문 파이프라인 안정성 기준

## 목적

이 문서는 ERP 반영 및 외부 플랫폼 수신 기능을 추가하기 전에 현재 `ORDER_COLLECT -> ORDER_NORMALIZE` 흐름에서 반드시 유지해야 하는 회귀 기준을 정리한다.

## 현재 처리 흐름

```text
ORDER_COLLECT Job + Outbox PENDING
  -> Outbox Publisher Kafka 발행 + Outbox SENT
  -> Worker ORDER_COLLECT 처리
  -> hub_job_result Raw 저장
  -> ORDER_COLLECT SUCCESS
  -> ORDER_NORMALIZE child Job + Outbox PENDING
  -> Outbox Publisher Kafka 발행 + Outbox SENT
  -> Worker ORDER_NORMALIZE 처리
  -> hub_collected_order / item / delivery upsert
  -> ORDER_NORMALIZE SUCCESS
```

수집 결과 저장, 부모 Job 성공, 정규화 child Job 생성, child Outbox 생성은 하나의 DB 트랜잭션으로 처리한다. 따라서 부모 `ORDER_COLLECT SUCCESS`는 정규화까지 성공했다는 의미가 아니라, 수집 결과와 다음 단계 실행 요청이 DB에 안전하게 저장됐다는 의미다.

## Job 관계 필드

`parent_job_id`, `correlation_id`, `causation_id`는 request key 문자열을 해석하지 않고 파이프라인 실행 관계를 추적하기 위해 도입했다. `schema_version`, `payload_version`은 향후 Job envelope와 Job Type별 payload 계약을 독립적으로 변경하기 위한 버전 경계다.

`ORDER_NORMALIZE`는 다음 관계를 가진다.

```text
parent_job_id = ORDER_COLLECT request_id
causation_id = ORDER_COLLECT request_id
correlation_id = ORDER_COLLECT correlation_id
schema_version = 1.0
payload_version = 1.0
```

## 후속 Job과 Outbox

Worker가 child Job을 DB에 저장한 뒤 Kafka에 직접 발행하면 DB commit과 Kafka 발행 사이에 유실 구간이 생긴다. 따라서 후속 Job도 Job 생성과 Outbox `PENDING` 저장을 한 트랜잭션으로 묶고, 공통 Outbox Publisher가 저장된 `partition_key`로 발행한다.

- 부모 Job `SUCCESS`: 현재 단계 결과와 다음 단계 Outbox가 DB에 commit됨
- Outbox `SENT`: Kafka broker 발행 성공
- child Job `SUCCESS`: 다음 단계 업무 처리 성공

## Retry와 Replay

Retry와 DLQ replay는 DB의 원래 `job_type`, payload, 관계 필드 및 계약 버전을 보존한다. 실패한 `ORDER_NORMALIZE`를 `ORDER_COLLECT`로 재구성하면 이미 성공한 쇼핑몰 호출이 반복될 수 있으므로 금지한다. 재발행은 직접 Kafka Producer가 아니라 Outbox를 사용하며, 기존 Outbox partition key가 있으면 우선 재사용한다.

## Resource 기반 Partition/Lock Key

Job Type이 달라도 같은 외부 자원을 사용하는 작업은 동일한 순서 및 동시성 경계를 사용해야 한다. 따라서 key 생성 기준을 Job Type에서 외부 자원으로 변경했다.

| 작업/자원 | Partition 또는 Lock key |
|---|---|
| 쇼핑몰 계정 | `channel-account:{tenantId 또는 corpId}:{channelAccountId}` |
| ORDER_NORMALIZE | `{sourceRequestId}` |
| 외부 플랫폼 계정 확장 계약 | `source-account:{tenant}:{sourceSystem}:{sourceAccountId}` |
| ERP 연결 확장 계약 | `erp-connection:{tenant}:{erpConnectionId}` |

기존 `ORDER_COLLECT:{channelAccountId}` partition/lock 문자열은 `channel-account:{tenant}:{channelAccountId}`로 변경됐다. 기존 Outbox에 저장된 key는 retry/replay 시 그대로 재사용한다. 구 버전과 신 버전 Worker가 동시에 동작하면 서로 다른 partition 및 lock key를 사용할 수 있으므로 배포 시 기존 Worker를 drain한 뒤 전환해야 한다.

Mock Mall도 계정 단위 partition key를 사용하므로 기존 page별 key보다 Kafka 병렬성이 낮아질 수 있다. 실제 외부 자원과 같은 계약을 우선 적용한 결과이며, 부하 테스트 또는 대량 정규화 병렬화가 필요하면 안정적인 shard 수와 주문 ID hash를 사용하는 별도 shard 정책을 검토한다.

## 회귀 테스트 기준

| 검증 대상 | 테스트 위치 |
|---|---|
| 최초 Job/Outbox 생성 및 resource key | API `HubJobServiceImplTest`, `JobOutboxServiceImplTest` |
| Outbox가 저장된 key로 Kafka 발행 | API `JobOutboxPublisherTest` |
| Resource resolver 계약 | API `JobResourceKeyResolverTest`, Worker `jobKeys.test.ts` |
| Raw + 부모 SUCCESS + child + Outbox 원자성 | Worker `postgres.jobEnvelope.integration.test.ts` |
| ORDER_NORMALIZE 공통 테이블 upsert와 SUCCESS | Worker `postgres.jobEnvelope.integration.test.ts` |
| ORDER_COLLECT/ORDER_NORMALIZE retry envelope 보존 | API `HubJobServiceImplTest` |
| DLQ replay Outbox 및 key 보존 | API `KafkaMonitorServiceReplayTest` |

DB/Kafka 통합 테스트는 Testcontainers 실행 환경에서 수행한다. 로컬 컨테이너 런타임이 없으면 fast test와 타입 검사는 실행할 수 있지만 통합 테스트는 CI 또는 Docker가 활성화된 환경에서 확인해야 한다.
