# hub-api-erp

Spring Boot 3.3 + Java 17 based HUB API.

The API receives order collection requests from ERP, stores one job per channel in PostgreSQL, and publishes each job to Kafka topic `hub.jobs`.

## Stack

- Java 17
- Spring Boot 3.3.5
- PostgreSQL 16
- Apache Kafka 3.7.2
- Spring Data JPA

## APIs

UI/API endpoints use JWT authentication after login. External order export endpoints use a separate external API token issued through the HMAC-based client flow.

### Create Batch Jobs

```http
POST /api/hub/jobs/batch
Content-Type: application/json
```

Request:

```json
{
  "frDt": "20260512",
  "toDt": "20260513",
  "mallKeys": ["11ST", "GODO"]
}
```

Response:

```json
{
  "jobs": [
    {
      "requestId": "uuid",
      "channelCd": "11ST",
      "status": "QUEUED"
    }
  ]
}
```

Each channel creates one `hub_job`.

Request key format:

```text
{mallKey}_{frDt}_{toDt}_{username}
```

Duplicate `requestKey` requests return the existing job.

### Get Job

```http
GET /api/hub/jobs/{requestId}
```

Response:

```json
{
  "requestId": "uuid",
  "sourceErp": "HUB_BATCH",
  "jobType": "ORDER_COLLECT",
  "requestKey": "ORDER_COLLECT_A001_11ST_shop_001_20260512_20260513",
  "status": "QUEUED",
  "retryCount": 0,
  "errorMessage": null,
  "createdAt": "2026-05-13T10:00:00",
  "updatedAt": "2026-05-13T10:00:00"
}
```

## Local Run

```bash
cp .env.example .env
```

Run shared infrastructure from the repository root:

```bash
docker compose up -d
```

Then start the API server:

```bash
./gradlew bootRun
```

Local services:

- PostgreSQL: `localhost:5432`
- Kafka: `localhost:9092`

Frontend:

```bash
cd src/main/frontend
npm install
npm run dev
```
