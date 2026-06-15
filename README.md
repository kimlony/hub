# Easy Hub

Easy Hub는 쇼핑몰 주문수집 업무를 Job Queue 기반으로 자동화하고, 실패·재시도·복구·정규화 과정을 추적 가능하게 만든 백엔드 중심 운영 자동화 프로젝트입니다.

이 프로젝트의 핵심은 Kafka를 사용해 본 것이 아니라, 운영자가 직접 실행하고 확인하던 주문수집 흐름을 자동화 가능한 Job 처리 구조로 바꾼 것입니다. 실패한 Job은 requestId 기준으로 추적할 수 있고, Worker 장애나 외부 API 일시 장애가 발생해도 Retry, Recovery, DLQ 흐름을 통해 운영자가 DB와 로그를 직접 뒤지는 일을 줄이도록 설계했습니다.

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

Easy Hub는 이 문제를 Job 기반 자동화 파이프라인으로 풀어보는 프로젝트입니다. 정상 수집 기능뿐 아니라 실패 이후의 재시도, 복구, 실패 보관, 모니터링까지 하나의 운영 흐름으로 설계했습니다.

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

## 기술 선택과 운영 효과

### Kafka

**문제**

주문수집은 외부 쇼핑몰 API 응답 시간과 장애에 직접 영향을 받는 I/O 중심 작업입니다. API 서버가 이를 동기 처리하면 사용자 요청 시간이 외부 API 상태에 종속되고, 장애 발생 시 사용자는 응답 지연이나 실패를 그대로 경험하게 됩니다.

**설계**

주문수집 요청 접수와 실제 수집 처리를 분리하기 위해 Kafka 기반 Job Queue를 사용했습니다. API 서버는 Job을 생성하고 Kafka에 발행하는 역할에 집중하고, Worker는 외부 API 호출과 결과 저장을 담당하도록 나눴습니다.

**구현**

- API 서버는 `hub_job`을 생성하고 `hub.jobs` topic으로 Job 메시지를 발행
- Worker consumer는 Kafka message를 받아 채널별 Handler로 라우팅
- Kafka partition과 consumer group을 통해 Worker 병렬 처리 구조 구성
- 실패 메시지는 `hub.jobs.dlq` topic으로 분리
- Kafka lag, partition, consumer 상태를 모니터링 화면에 표시

**운영 효과**

Kafka를 통해 API 요청 흐름과 외부 수집 작업을 분리했습니다. 운영자는 Job이 어느 partition에 쌓였는지, 어떤 Worker가 처리했는지, lag가 남아 있는지를 확인할 수 있어 장애 지점을 더 빠르게 파악할 수 있습니다.

### Redis Stream에서 Kafka로 전환한 이유

**문제**

초기에는 Redis Stream을 Job Queue 후보로 검토했습니다. Redis Stream은 설정이 단순하고 가볍게 시작할 수 있지만, 이 프로젝트에서는 단순 큐보다 운영 중 처리 상태를 관찰하는 기능이 더 중요했습니다.

**설계**

주문수집 Job은 외부 API 장애와 지연에 영향을 받기 때문에, 단순히 메시지를 처리하는 것보다 partition 기반 병렬 처리, consumer group 상태, lag, DLQ 분리, key 기반 순서 제어가 필요했습니다.

**구현**

- `hub.jobs` topic을 partition 단위로 구성
- consumer group 기반 Worker 병렬 처리
- Kafka key로 동일 계정 Job의 partition 분산 제어
- `hub.jobs.dlq` topic으로 반복 실패 Job 분리
- Kafka 현황 화면에서 topic, partition, lag, consumer 정보를 표시

**운영 효과**

Redis가 부족해서 Kafka로 바꾼 것이 아니라, 운영자가 처리 지연과 실패 흐름을 관찰할 수 있는 구조가 필요했기 때문에 Kafka를 선택했습니다. 결과적으로 메시지 큐가 내부 구현이 아니라 운영 화면과 연결된 관측 대상이 되었습니다.

### Docker

**문제**

Kafka, PostgreSQL, Worker를 로컬에서 함께 실행해야 했고, Worker consumer를 여러 개 띄워 병렬 처리를 검증해야 했습니다. PM2로도 실행은 가능했지만 Windows 로컬 환경에 영향을 받는 로그와 실행 차이가 있었습니다.

**설계**

실행 환경 차이를 줄이기 위해 Docker Compose 기반으로 Kafka, PostgreSQL, Worker role을 분리했습니다.

**구현**

- `consumer`, `recovery`, `http` Worker role 분리
- Worker consumer를 여러 컨테이너로 실행
- Kafka와 PostgreSQL을 같은 compose 네트워크에서 실행
- 로컬 실행과 추후 서버 실행을 유사한 방식으로 구성

**운영 효과**

개발 PC 환경에 덜 의존하는 실행 구조를 만들었고, Worker 병렬 처리와 Recovery role을 같은 방식으로 재현할 수 있게 했습니다.

## 장애 대응 설계

### Retry / Recovery / DLQ

```text
일시 실패        -> retry backoff
오래 멈춘 Job    -> Recovery Scanner
반복 실패        -> DLQ topic
동일 계정 동시 실행 -> DB Lock
처리 과정 추적    -> hub_job_log
```

**문제**

외부 쇼핑몰 API는 일시적으로 실패할 수 있습니다. 모든 실패를 운영자가 직접 재실행하면 반복 업무가 줄지 않고, 반대로 무한 재시도하면 외부 시스템에 불필요한 부하를 줄 수 있습니다.

**설계**

일시 장애는 Retry Backoff로 자동 재시도하고, Worker 장애로 멈춘 Job은 Recovery Scanner가 다시 찾으며, 반복 실패 Job은 DLQ로 분리하도록 설계했습니다.

**구현**

- 실패 시 `next_retry_at`을 계산해 지연 재시도
- `QUEUED`, stale `PROCESSING`, retry 대상 Job을 Recovery Scanner가 주기적으로 확인
- 최대 재시도 초과 Job은 `hub.jobs.dlq` topic으로 발행
- 모든 주요 상태 전이는 `hub_job_log`에 이벤트로 저장

**운영 효과**

장애가 발생했을 때 운영자가 바로 DB와 로그를 뒤지기보다, Job 상태와 로그, DLQ 화면을 기준으로 원인을 추적할 수 있습니다. 일시 장애는 자동 재시도로 흡수하고, 반복 실패만 운영자가 확인하도록 흐름을 분리했습니다.

### Consumer 병렬 처리와 Lock

**문제**

Worker를 여러 개 실행하면 처리량은 늘릴 수 있지만, 같은 쇼핑몰 계정의 주문수집이 동시에 실행될 위험이 생깁니다. 동일 계정 동시 수집은 중복 저장, 외부 API 제한, IP 차단 같은 운영 문제로 이어질 수 있습니다.

**설계**

Kafka key를 1차 방어로 사용해 같은 계정의 Job을 같은 partition으로 보내고, 실제 외부 API 호출 직전에는 DB Lock을 2차 방어로 사용했습니다.

```text
ORDER_COLLECT:{userId}:{mallKey}
```

```text
Kafka key  -> 같은 partition으로 정렬하는 1차 방어
DB Lock    -> 실제 실행 단계에서 동일 계정 동시 실행을 막는 2차 방어
```

**구현**

- Job 발행 시 `ORDER_COLLECT:{userId}:{mallKey}` 형태의 Kafka key 사용
- Worker 처리 시 `userId + mallKey` 기준 lock key 생성
- lock 획득 실패 시 실패 처리하지 않고 `QUEUED`로 되돌림
- 수집 완료 또는 실패 후 lock 해제

**운영 효과**

Worker를 병렬로 운영하면서도 동일 계정에 대한 중복 수집 위험을 줄였습니다. 병렬 처리와 외부 API 보호 사이의 균형을 맞춘 구조입니다.

### Recovery

**문제**

Worker가 Kafka message를 받은 뒤 처리 중 종료되면 DB 상태가 `PROCESSING`으로 남을 수 있습니다. Kafka offset commit과 DB 상태 업데이트는 하나의 트랜잭션이 아니기 때문에, 중간 장애를 전제로 한 복구 흐름이 필요했습니다.

**설계**

Recovery Scanner를 별도 Worker role로 두고, 일정 시간 이상 멈춘 Job을 다시 claim하도록 설계했습니다.

**구현**

- 오래된 `QUEUED` Job 조회
- stale `PROCESSING` Job 조회
- `next_retry_at`이 지난 retry 대상 Job 조회
- 여러 Recovery 프로세스가 같은 Job을 잡지 않도록 `FOR UPDATE SKIP LOCKED` 사용

**운영 효과**

Worker가 비정상 종료되어도 운영자가 수동으로 상태를 찾아 수정하지 않고, Recovery Scanner가 멈춘 Job을 다시 처리 흐름에 올릴 수 있습니다.

## 주문 데이터 정규화

**문제**

쇼핑몰마다 주문 응답 구조가 다릅니다. 모든 raw 필드를 DB 컬럼으로 만들면 스키마가 복잡해지고, 채널 응답이 바뀔 때마다 DB 변경이 반복될 수 있습니다.

**설계**

원본 응답은 그대로 보존하고, 별도 정규화 Job에서 공통 주문 모델로 변환하도록 분리했습니다.

**구현**

- raw 응답은 `hub_job_result.result_payload`에 JSONB로 먼저 보존
- 수집 성공 후 `ORDER_NORMALIZE` Job 생성
- 채널별 Normalizer가 공통 주문 모델로 변환
- 정규화 결과는 `hub_collected_order`, `hub_collected_order_item`, `hub_collected_order_delivery`에 저장

Normalizer는 다음처럼 분리했습니다.

- `SmartstoreOrderNormalizer`: NAVER / NSS
- `CoupangOrderNormalizer`: COUPANG
- `GiftOrderNormalizer`: GCHAN
- `FlatCommerceOrderNormalizer`: 11ST / GODO
- `GenericOrderNormalizer`: fallback

**운영 효과**

채널별 응답 차이를 Worker 내부 정규화 계층에 모아 외부 API에는 일관된 주문 데이터를 제공할 수 있게 했습니다. 원본 데이터도 보존하기 때문에 정규화 오류가 발생해도 raw payload를 기준으로 재처리와 원인 분석이 가능합니다.

자세한 내용은 [Order Normalization Pipeline](docs/order-normalization-pipeline.md)을 참고하세요.

## 보안 측면 개선

**문제**

Job payload에 API key나 password가 포함되면 DB, Kafka, 로그, DLQ에 민감정보가 남을 수 있습니다.

**설계**

payload에는 수집에 필요한 식별자와 기간 정보만 저장하고, 실제 credential은 Worker 처리 시점에 조회하도록 분리했습니다.

**구현**

- Job payload에는 `userId`, `mallKey`, `channelCd`, `frDt`, `toDt`만 저장
- Worker가 처리 시점에 DB에서 활성 credential 조회
- 복호화한 credential은 외부 API 호출에만 사용
- 로그와 DLQ에는 credential을 저장하지 않도록 구성

**운영 효과**

Kafka message, DB payload, DLQ에 민감정보가 남을 위험을 줄였습니다. 또한 retry/recovery 시점에 최신 credential을 사용할 수 있어 오래된 인증정보로 재실행되는 위험도 낮췄습니다.

## 관측과 모니터링

**문제**

장애가 발생했을 때 운영자가 DB와 로그를 직접 확인해야 한다면 자동화 효과가 줄어듭니다. Job이 어디서 멈췄는지, Worker가 살아 있는지, Kafka lag가 남아 있는지 화면에서 확인할 수 있어야 했습니다.

**설계**

운영자가 장애 지점을 빠르게 좁힐 수 있도록 Job, Worker, Kafka, DLQ, 처리시간 지표를 한 화면 흐름으로 연결했습니다.

**구현**

- Job 상태별 건수
- 최근 Job 목록
- Job 상세 로그
- Worker heartbeat 상태
- Kafka topic / partition / lag
- DLQ 메시지 목록
- 채널별 수집 현황
- 처리시간 평균, P95, P99
- 부하 테스트 결과 그래프

**운영 효과**

운영자는 “수집이 안 됐다”는 현상만 보는 것이 아니라, API 요청 생성, Kafka 적재, Worker 처리, Retry, DLQ 중 어느 지점에서 문제가 발생했는지 추적할 수 있습니다.

## 부하 테스트와 지표

실서비스 운영 데이터가 아닌 로컬 테스트 기준으로 synthetic Job 부하 테스트를 진행했습니다.

- synthetic Job 1,000건 처리 테스트 수행
- Kafka partition 4개, Worker consumer 4개 구성
- Kafka lag가 partition별로 쌓이고 줄어드는 흐름 확인
- 처리량과 처리시간 P95/P99를 Dashboard에 표시
- 실패 Job이 retry 이후 DLQ로 분리되는 흐름 확인

현재 지표는 대규모 트래픽 성능을 증명하기 위한 수치라기보다, Job 처리 구조가 병렬 처리와 장애 추적을 지원하는지 검증하기 위한 관측 지표입니다.

## 운영 효과 요약

- 운영자가 직접 수행하던 주문수집 업무를 Job Queue 기반 자동화 구조로 전환
- API 요청과 외부 쇼핑몰 수집 작업을 분리해 사용자 요청 흐름의 의존성 축소
- 장애 발생 시 로그 확인 중심 대응에서 Job 추적 기반 대응 구조로 개선
- Retry, Recovery, DLQ 흐름을 통해 반복적인 운영 개입을 줄이는 구조 마련
- Kafka lag, Worker heartbeat, DLQ 메시지를 화면에서 확인할 수 있는 운영 모니터링 기반 구축
- 채널별 raw 응답을 공통 주문 모델로 정규화해 외부 API 제공 기반 마련

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

## 로컬 실행

### 1. 환경 파일 생성

```bash
cp hub-worker/.env.example hub-worker/.env
cp hub-api-erp/.env.example hub-api-erp/.env
```

`HUB_AES_SECRET`은 API와 Worker가 같은 값을 사용해야 하며 정확히 32 bytes여야 합니다. 공개 저장소에는 실제 credential, token, DB 비밀번호를 커밋하지 않습니다.

공개 저장소에는 기본 관리자 계정 seed를 포함하지 않습니다. 로컬 테스트 계정은 PostgreSQL에 `users` 레코드를 직접 생성하거나, 별도 비공개 seed SQL로 관리하세요.

### 2. 인프라와 Worker 실행

루트 디렉터리에서 PostgreSQL, Kafka, Worker role을 Docker Compose로 실행합니다.

```bash
docker compose up -d
```

Compose 구성은 다음 역할을 실행합니다.

- `hub-worker-consumer`: Kafka Job 처리
- `hub-worker-recovery`: 멈춘 Job 복구
- `hub-worker-http`: Worker 상태 확인용 HTTP 서버

### 3. API 서버 실행

```bash
cd hub-api-erp
./gradlew bootRun
```

### 4. Frontend 실행

```bash
cd hub-api-erp/src/main/frontend
npm install
npm run dev
```

### 5. 검증 명령

```bash
cd hub-worker
npm install
npm run check
npm test

cd ../hub-api-erp
./gradlew compileJava

cd src/main/frontend
npm run build
```

## 관련 문서

- [Order Normalization Pipeline](docs/order-normalization-pipeline.md)
- [Normalized Order Schema](docs/order-export-normalized-schema.sql)
- [External API Client Schema](docs/external-api-client-schema.sql)
