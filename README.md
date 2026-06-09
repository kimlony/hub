# Easy Hub

Easy Hub는 쇼핑몰 주문수집 업무를 Job Queue 기반으로 자동화하고, 실패·재시도·복구·정규화 과정을 추적 가능하게 만든 백엔드 중심 운영 자동화 프로젝트입니다.

ERP 물류·영업 업무에서 반복적으로 발생하는 주문수집, 외부 시스템 연동, 데이터 검증 과정을 자동화하는 데 초점을 맞췄습니다. 단순히 쇼핑몰 API를 호출하는 기능이 아니라, 운영 중 실패가 발생했을 때 어떤 Job이 왜 실패했는지 확인하고 다시 처리할 수 있는 구조를 만드는 것이 핵심 목표였습니다.

## 핵심 키워드

- Node.js / TypeScript Worker
- Spring Boot Hub API
- Kafka 기반 비동기 Job 처리
- PostgreSQL 기반 Job 상태·로그 저장
- Retry / Recovery / DLQ
- DB Lock 기반 동일 계정 동시 수집 방지
- 채널별 주문 데이터 정규화
- Worker / Kafka / DLQ 모니터링 UI

## 문제 정의

기존 주문수집 업무는 여러 방식이 섞여 있었습니다.

- 외부 연동 플랫폼을 통한 주문수집
- Node.js + Puppeteer 기반 매크로 서버
- 일부 쇼핑몰 API 직접 호출
- 운영자의 수동 상태 확인 및 재실행

이 방식은 정상 상황에서는 동작하지만, 장애가 발생했을 때 추적이 어려웠습니다. 어떤 계정의 어떤 기간 수집이 멈췄는지, 다시 실행해도 되는지, 일부 데이터가 이미 저장됐는지 확인하기 어려웠습니다.

Easy Hub는 이 문제를 Job 기반 자동화 파이프라인으로 풀어보는 프로젝트입니다.

## 전체 흐름

```text
운영자 / 스케줄러
      |
      v
Hub API (Spring Boot)
- 수집 요청 접수
- hub_job 생성
- Kafka message 발행
      |
      v
Kafka topic: hub.jobs
      |
      v
Node.js Worker
- Job consume
- credential 조회
- DB Lock 획득
- 쇼핑몰 API 호출
      |
      v
PostgreSQL
- raw payload 저장
- Job 상태 / 로그 저장
      |
      v
ORDER_NORMALIZE Job
      |
      v
공통 주문 모델 저장
```

## 기술 선택 이유

### Kafka

주문수집은 외부 쇼핑몰 API 응답 시간과 장애에 직접 영향을 받는 I/O 중심 작업입니다. API 서버가 이를 동기 처리하면 사용자 요청 시간이 외부 API 상태에 종속됩니다.

그래서 주문수집 요청 접수와 실제 수집 처리를 Kafka 기반 Job Queue로 분리했습니다.

- API 서버는 Job 생성과 상태 응답에 집중
- Worker는 외부 API 호출과 결과 저장에 집중
- Worker 수를 늘려 처리량에 맞게 확장 가능
- Kafka lag로 처리 지연 관찰 가능
- 실패 메시지를 DLQ topic으로 분리 가능

### Redis Stream에서 Kafka로 전환한 이유

초기에는 Redis Stream을 Job Queue 후보로 검토했습니다. Redis Stream은 설정이 단순하고 가볍게 시작할 수 있다는 장점이 있습니다.

하지만 이 프로젝트에서는 단순 큐보다 partition 기반 병렬 처리, consumer group, lag 모니터링, DLQ 분리, Kafka key를 활용한 동일 계정 Job 순서 제어가 더 중요했습니다.

따라서 Redis가 부족해서가 아니라, 운영 추적성과 병렬 처리 요구에는 Kafka의 topic/partition/consumer group 모델이 더 적합하다고 판단했습니다.

### Docker

Kafka, PostgreSQL, Worker를 로컬에서 함께 실행해야 했고, Worker consumer를 여러 개 띄워 병렬 처리를 검증해야 했습니다.

초기에는 PM2로 Worker를 실행했지만, 로컬 Windows 환경에 영향을 받는 문제가 있었습니다. Docker Compose로 전환하면서 Kafka, PostgreSQL, Worker 실행 환경을 더 일관되게 재현할 수 있게 했습니다.

## 장애 대응 설계

### Retry / Recovery / DLQ

```text
일시 실패        -> retry backoff
오래 멈춘 Job    -> Recovery Scanner
반복 실패        -> DLQ topic
동일 계정 동시 실행 -> DB Lock
처리 과정 추적    -> hub_job_log
```

외부 쇼핑몰 API는 일시적으로 실패할 수 있습니다. 모든 실패를 즉시 최종 실패로 처리하면 운영자가 처리해야 할 일이 많아지고, 반대로 무한 재시도하면 외부 시스템에 불필요한 부하를 줄 수 있습니다.

그래서 retry backoff를 적용하고, 최대 재시도를 넘긴 Job은 `hub.jobs.dlq` topic으로 분리했습니다.

### Consumer 병렬 처리와 Lock

Kafka key는 동일 계정 Job을 같은 partition으로 보내는 1차 방어입니다.

```text
ORDER_COLLECT:{userId}:{mallKey}
```

하지만 수동 재시도, Recovery Scanner, 재발행 같은 흐름에서는 Kafka partition 순서만으로 동일 계정 동시 실행을 완전히 막기 어렵습니다.

그래서 실제 외부 API 호출 직전에는 `userId + mallKey` 기준 DB Lock을 획득하도록 했습니다.

```text
Kafka key  -> 같은 partition으로 정렬하는 1차 방어
DB Lock    -> 실제 실행 단계에서 동일 계정 동시 실행을 막는 2차 방어
```

### Recovery

Worker가 Kafka message를 받은 뒤 처리 중 종료되면 DB 상태가 `PROCESSING`으로 남을 수 있습니다. Kafka offset commit과 DB 상태 업데이트는 하나의 트랜잭션이 아니기 때문에, 중간 장애를 전제로 한 복구 흐름이 필요했습니다.

Recovery Scanner는 오래된 `QUEUED` Job, stale `PROCESSING` Job, `next_retry_at`이 지난 retry 대상 Job을 다시 claim합니다. 여러 Recovery 프로세스가 같은 Job을 동시에 잡지 않도록 `FOR UPDATE SKIP LOCKED`를 사용했습니다.

## 주문 데이터 정규화

쇼핑몰마다 주문 응답 구조가 다릅니다. 모든 raw 필드를 DB 컬럼으로 만들면 스키마가 복잡해지고, 채널 응답이 바뀔 때마다 DB 변경이 반복될 수 있습니다.

그래서 다음 전략을 사용했습니다.

- raw 응답은 `hub_job_result.result_payload`에 JSONB로 먼저 보존
- 별도 `ORDER_NORMALIZE` Job 생성
- 채널별 Normalizer가 공통 주문 모델로 변환
- 정규화 결과는 `hub_collected_order`, `hub_collected_order_item`, `hub_collected_order_delivery`에 저장

Normalizer는 다음처럼 분리했습니다.

- `SmartstoreOrderNormalizer`: NAVER / NSS
- `CoupangOrderNormalizer`: COUPANG
- `GiftOrderNormalizer`: GCHAN
- `FlatCommerceOrderNormalizer`: 11ST / GODO
- `GenericOrderNormalizer`: fallback

자세한 내용은 [Order Normalization Pipeline](docs/order-normalization-pipeline.md)을 참고하세요.

## 보안 측면 개선

Job payload에는 credential을 넣지 않았습니다. payload에는 `userId`, `mallKey`, `channelCd`, `frDt`, `toDt` 같은 식별자와 기간 정보만 저장합니다.

Worker는 처리 시점에 DB에서 활성 credential을 조회하고, 복호화 후 외부 API 호출에만 사용합니다.

이 구조를 통해 Kafka message, DB payload, DLQ에 민감정보가 남을 위험을 줄였습니다.

## 관측과 모니터링

운영자가 직접 DB와 로그를 뒤지지 않아도 상태를 확인할 수 있도록 모니터링 화면을 추가했습니다.

- Job 상태별 건수
- 최근 Job 목록
- Job 상세 로그
- Worker heartbeat 상태
- Kafka topic / partition / lag
- DLQ 메시지 목록
- 채널별 수집 현황
- 처리시간 평균, P95, P99
- 부하 테스트 결과 그래프

## 부하 테스트와 지표

실서비스 운영 데이터가 아닌 로컬 테스트 기준으로 synthetic Job 부하 테스트를 진행했습니다.

- synthetic Job 1,000건 처리 테스트 수행
- Kafka partition 4개, Worker consumer 4개 구성
- Kafka lag가 partition별로 쌓이고 줄어드는 흐름 확인
- 처리량과 처리시간 P95/P99를 Dashboard에 표시
- 실패 Job이 retry 이후 DLQ로 분리되는 흐름 확인

현재 지표는 대규모 트래픽 성능을 증명하기 위한 수치라기보다, Job 처리 구조가 병렬 처리와 장애 추적을 지원하는지 검증하기 위한 관측 지표입니다.

## 한계와 다음 개선 방향

### Outbox 패턴 미적용

현재는 Job 생성 후 Kafka message를 발행하는 구조입니다. Recovery Scanner가 오래된 `QUEUED` Job을 다시 처리해 일부 보완하지만, DB 저장과 Kafka 발행이 완전한 단일 트랜잭션은 아닙니다.

운영 환경이라면 Outbox 테이블에 발행 대상 이벤트를 먼저 저장하고, 별도 publisher가 Kafka 발행 성공 여부를 관리하는 구조로 보완하는 것이 더 안전하다고 판단했습니다.

### DLQ 재처리 자동화

DLQ 메시지는 화면에서 확인할 수 있지만, 운영자가 선택한 DLQ 메시지를 다시 Job으로 재발행하는 기능은 아직 보완 대상입니다.

### 정규화 테스트 데이터 확대

현재는 주요 채널 응답 형태를 기준으로 Normalizer를 구성했지만, 실제 운영에서는 쇼핑몰별 예외 케이스가 더 많을 수 있습니다. 채널별 샘플 응답을 더 확보해 회귀 테스트를 늘릴 필요가 있습니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| API | Java 17, Spring Boot 3, MyBatis |
| Frontend | React, Vite, TypeScript |
| Worker | Node.js, TypeScript, KafkaJS |
| Validation | Zod |
| Database | PostgreSQL |
| Messaging | Apache Kafka |
| Logging | pino, PostgreSQL job event log |
| Test | Jest, ts-jest |
| Runtime | Docker Compose |

## 관련 문서

- [Order Normalization Pipeline](docs/order-normalization-pipeline.md)
- [Normalized Order Schema](docs/order-export-normalized-schema.sql)
- [External API Client Schema](docs/external-api-client-schema.sql)
