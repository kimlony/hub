# Easy Hub

Easy Hub는 여러 쇼핑몰 주문 수집 업무를 Job Queue 기반으로 자동화하고, 실패/재시도/정규화/모니터링까지 추적할 수 있게 만든 운영형 데이터 파이프라인 프로젝트입니다.

핵심 목표는 단순히 주문을 가져오는 것이 아니라, **수집 요청 접수, Kafka 발행, Worker 처리, 정규화 저장, 실패 추적, DLQ 재처리, 성능 비교**까지 하나의 흐름으로 관찰할 수 있게 만드는 것입니다.

## 주요 기능

- Spring Boot 기반 Hub API
- Node.js / TypeScript Worker
- PostgreSQL 기반 Job 상태, 로그, Outbox 저장
- Kafka 기반 비동기 Job 처리
- Outbox 패턴 기반 Kafka 발행 안정화
- Retry / Recovery / DLQ 처리
- 실패 코드 기반 재시도 정책
  - 4xx 인증/인가/요청 오류는 즉시 실패 처리
  - 5xx, timeout, network 오류는 retry 대상
- DLQ 메시지 조회 및 수동 재처리
- Worker heartbeat / Kafka lag / DLQ 모니터링 UI
- Mock Mall 기반 대량 주문 e2e 부하 테스트
- Testcontainers 기반 PostgreSQL/Kafka 통합 테스트
- GitHub Actions 기반 빠른 검증 및 수동 통합 테스트

## 시스템 흐름

```text
사용자 / 화면
  -> Hub API
  -> hub_job 생성
  -> hub_job_outbox PENDING 저장
  -> Outbox Publisher
  -> Kafka topic
  -> Worker consumer
  -> 외부몰 API 또는 Mock Mall 처리
  -> hub_job_result 저장
  -> ORDER_NORMALIZE Job 생성
  -> Worker 정규화 처리
  -> hub_collected_order 저장
  -> 화면 / 외부 API 조회
```

## 모듈 구성

| 경로 | 역할 |
| --- | --- |
| `hub-api-erp` | Spring Boot API, React frontend, MyBatis mapper |
| `hub-worker` | Kafka consumer, recovery worker, order normalizer |
| `docs` | 테스트, 부하 테스트, 정규화 설계 문서 |
| `.github/workflows` | GitHub Actions CI 구성 |
| `scripts` | 로컬 테스트 실행 스크립트 |

## Hub API 패키지 구조

리팩토링 후 Java 루트 패키지는 `hub`입니다.

```text
hub
  ├─ job
  │  ├─ controller
  │  ├─ service
  │  ├─ mapper
  │  ├─ domain
  │  ├─ event
  │  └─ dto
  │     ├─ request
  │     └─ response
  ├─ outbox
  ├─ kafka
  ├─ loadtest
  ├─ schedule
  ├─ worker
  ├─ channel
  ├─ external
  ├─ order
  ├─ news
  ├─ notice
  ├─ auth
  ├─ config
  └─ exception
```

IntelliJ 실행 설정의 Main class는 다음 값을 사용합니다.

```text
hub.BizbeeHubApplication
```

로컬 설정을 `application-local.yml`에서 읽으려면 Active profiles에 `local`을 지정해야 합니다.

## Outbox 패턴

수집 요청이 들어오면 API는 Kafka에 바로 발행하지 않고 다음 순서로 처리합니다.

1. `hub_job`에 작업을 `QUEUED` 상태로 저장
2. 같은 트랜잭션에서 `hub_job_outbox`에 `PENDING` 이벤트 저장
3. `JobOutboxPublisher`가 주기적으로 `PENDING` 이벤트 claim
4. Kafka 발행 성공 시 `SENT`
5. 발행 실패 시 backoff 후 `PENDING` 재시도
6. 최대 재시도 초과 시 `FAILED`

Outbox claim SQL은 `FOR UPDATE SKIP LOCKED`를 사용해 여러 API 인스턴스가 있어도 같은 이벤트를 중복 발행하지 않게 합니다.

## Retry / Recovery / DLQ

Worker 처리 실패는 오류 성격에 따라 분리합니다.

| 오류 유형 | 처리 |
| --- | --- |
| HTTP 400대 인증/인가/요청 오류 | retry 제외, Job `FAILED` |
| HTTP 500대 | retry |
| timeout / network 오류 | retry |
| 최대 retry 초과 | DLQ 발행 |

DLQ 메시지는 Kafka 모니터링 화면에서 확인하고, 필요한 경우 `/api/hub/kafka/dlq/replay`를 통해 원본 Job 메시지를 다시 `hub.jobs`로 발행할 수 있습니다.

## Mock Mall e2e 부하 테스트

Mock Mall은 실제 데이터를 파일이나 DB에 저장하지 않고, `page`, `size`, `totalCount`, `seed` 기준으로 요청 시점에 주문 데이터를 deterministic하게 생성합니다.

비교한 대표 결과:

| Scenario | Orders | Elapsed | Orders/sec | Jobs/sec | P95 job ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `e2e-1p-1w` | 100,000 | 20m 14s | 82.4 | 1.6 | 807,728.5 | 0 |
| `e2e-4p-4w` | 100,000 | 6m 28s | 257.7 | 5.2 | 152,757.8 | 0 |

4 partitions / 4 workers 구성에서 전체 처리 시간은 약 68.0% 감소했고, 주문 처리량은 약 3.13배 증가했습니다.

자세한 실행 방법은 [Mock Mall e2e Load Test](docs/mock-mall-e2e-load-test.md)를 참고합니다.

## 테스트

로컬 테스트는 저장소 루트에서 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1
```

통합 테스트는 Testcontainers 기반 PostgreSQL/Kafka를 사용합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-integration.ps1
```

자세한 테스트 분리는 [Testing Guide](docs/testing.md)를 참고합니다.

## GitHub Actions

| Workflow | 실행 조건 | 내용 |
| --- | --- | --- |
| `Fast CI` | push, pull request | Java unit test, Worker check/test/build, Frontend build |
| `Integration Tests` | manual `workflow_dispatch` | Java DB integration test, Node DB/Kafka integration test |

통합 테스트는 GitHub Actions에서 Testcontainers로 임시 PostgreSQL/Kafka를 띄우기 때문에 운영 DB나 로컬 Docker Compose 데이터에 의존하지 않습니다.

## 로컬 실행

### 1. 인프라 실행

```powershell
docker compose up -d
```

### 2. API 실행

IntelliJ에서 실행할 경우:

```text
Main class: hub.BizbeeHubApplication
Active profiles: local
```

PowerShell에서 실행할 경우:

```powershell
cd hub-api-erp
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

`HUB_AES_SECRET`은 정확히 32 bytes여야 합니다. 로컬에서는 `application-local.yml` 또는 환경변수로 설정합니다.

### 3. Frontend 실행

```powershell
cd hub-api-erp/src/main/frontend
npm install
npm run dev
```

### 4. Worker 실행

```powershell
cd hub-worker
npm install
npm run build
```

Docker Compose worker를 사용할 경우:

```powershell
docker compose up -d hub-worker-consumer hub-worker-recovery hub-worker-http
```

## 관련 문서

- [Testing Guide](docs/testing.md)
- [Load Test Plan](docs/load-test-plan.md)
- [Mock Mall e2e Load Test](docs/mock-mall-e2e-load-test.md)
- [Order Normalization Pipeline](docs/order-normalization-pipeline.md)
- [Order Export Normalized Design](docs/order-export-normalized-design.md)
- [Multi-tenant Order Model](docs/multi-tenant-order-model.md)
