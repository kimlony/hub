# hub-api-erp

Spring Boot 3.3 + Java 17 기반 Easy Hub API입니다.

API는 화면 또는 외부 요청으로부터 주문 수집 Job을 생성하고, PostgreSQL에 상태를 저장한 뒤 Outbox 패턴으로 Kafka에 발행합니다. Worker가 처리한 결과는 정규화 테이블로 저장되고, 화면에서는 Job/Kafka/DLQ/Worker 상태를 확인할 수 있습니다.

## Stack

- Java 17
- Spring Boot 3.3.5
- MyBatis
- PostgreSQL 16
- Apache Kafka
- React + Vite + TypeScript frontend

## Main class

패키지 리팩토링 후 main class는 다음 값입니다.

```text
hub.BizbeeHubApplication
```

IntelliJ Run Configuration에서 기존 `com.bizbee.hub.BizbeeHubApplication`을 사용하면 실행 클래스를 찾지 못합니다.

로컬 설정을 읽으려면 Active profiles에 `local`을 지정합니다.

```text
Active profiles: local
```

## Package structure

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
  ├─ auth
  ├─ config
  └─ exception
```

MyBatis 설정:

```yaml
mybatis:
  mapper-locations: classpath:mapper/**/*.xml
  type-aliases-package: hub
```

## Core flow

```text
POST /api/hub/jobs/batch
  -> HubJobService
  -> hub_job INSERT
  -> hub_job_outbox INSERT
  -> JobOutboxPublisher
  -> Kafka hub.jobs
  -> Worker
```

## APIs

### Create batch jobs

```http
POST /api/hub/jobs/batch
Content-Type: application/json
```

Request:

```json
{
  "frDt": "20260618",
  "toDt": "20260618",
  "mallKeys": ["GODO", "11ST"]
}
```

Response:

```json
{
  "jobs": [
    {
      "requestId": "uuid",
      "channelCd": "GODO",
      "status": "QUEUED"
    }
  ]
}
```

### Job list/detail/logs

```http
GET /api/hub/jobs
GET /api/hub/jobs/{requestId}
GET /api/hub/jobs/{requestId}/logs
POST /api/hub/jobs/{requestId}/retry
```

### Kafka monitor / DLQ

```http
GET /api/hub/kafka/monitor
GET /api/hub/kafka/job-distribution
GET /api/hub/kafka/dlq
POST /api/hub/kafka/dlq/replay
```

DLQ replay는 DLQ 원본 메시지에서 Job payload를 추출해 `hub.jobs` topic으로 다시 발행합니다.

### ERP apply results

```http
GET /api/hub/erp/apply-results?status=&operation=&requestId=&correlationId=&erpConnectionId=&normalizedOrderId=&fromDate=&toDate=&page=1&size=20
GET /api/hub/erp/apply-results/{id}
```

목록과 단건 조회의 고객사 범위는 UI JWT의 `corpId`에서 자동으로 결정되며, 나머지 조회 조건은 선택입니다. 단건 조회 응답은 목록 필드에 더해 `requestPayload`, `responsePayload` 원문과 `payloadSummary`(byte 크기 요약)를 포함합니다.

### Job pipeline

```http
GET /api/hub/jobs/{requestId}/pipeline
```

`requestId`가 속한 `correlationId` 기준으로 `ORDER_COLLECT -> ORDER_NORMALIZE -> ERP_APPLY` Job 흐름과 연결된 `hub_erp_apply_result`를 함께 보여줍니다. 응답에는 `currentStage`, `failedStage`, `retryable`, `retryFromJobType`이 계산되어 포함됩니다.

curl 예시와 계산 필드 설명은 [docs/erp-apply-manual-verification.md](../docs/erp-apply-manual-verification.md)를 참고하세요.

### Mock Mall load test

```http
POST /api/hub/load-tests/mock-mall
GET /api/hub/load-tests
GET /api/hub/load-tests/{runId}
```

## Local run

### Full Docker

```powershell
cd C:\hub-git
Copy-Item .env.dev.example .env.dev
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

API URL:

```text
http://localhost:${HUB_API_PORT:-3000}
```

The API container uses `postgres:5432` and `kafka:9092` inside the compose network.

### Local IntelliJ API

Run only PostgreSQL/Kafka in Docker and run the API from IntelliJ or Gradle. The dev compose publishes PostgreSQL to `${POSTGRES_HOST_PORT:-5432}` and Kafka to `${KAFKA_HOST_PORT:-19092}` for Windows host access.

```powershell
cd C:\hub-git
Copy-Item .env.dev.example .env.dev
docker compose -f docker-compose.server.yml -f docker-compose.dev.yml --env-file .env.dev up -d postgres kafka
```

IntelliJ:

```text
Main class: hub.BizbeeHubApplication
Active profiles: local
```

PowerShell:

```powershell
cd C:\hub-git\hub-api-erp
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

`application-local.yml` uses:

```text
PostgreSQL: localhost:${POSTGRES_HOST_PORT:-5432}
Kafka: localhost:${KAFKA_HOST_PORT:-19092}
```

`HUB_AES_SECRET` must be exactly 32 bytes. Configure it in `application-local.yml` or environment variables.

Frontend:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp\src\main\frontend
npm install
npm run dev
```

## Verification

Java compile:

```powershell
.\gradlew.bat compileJava
```

Test compile:

```powershell
.\gradlew.bat compileTestJava
```

전체 빠른 검증은 저장소 루트에서 실행합니다.

```powershell
cd C:\Users\Scrap-2\bizbee-hub
powershell -ExecutionPolicy Bypass -File scripts/test-fast.ps1
```
