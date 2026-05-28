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

All APIs require:

```http
X-Hub-Api-Key: {API_KEY}
```

### Create Batch Jobs

```http
POST /api/hub/jobs/batch
Content-Type: application/json
```

Request:

```json
{
  "corpCd": "A001",
  "frDt": "20260512",
  "toDt": "20260513",
  "channels": [
    {
      "channelCd": "11ST",
      "channelAccountId": "shop_001",
      "authType": "API_KEY",
      "authInfo": {
        "apiKey": "xxxxx"
      }
    }
  ]
}
```

Response:

```json
{
  "jobs": [
    {
      "requestId": "uuid",
      "channelCd": "11ST",
      "channelAccountId": "shop_001",
      "status": "QUEUED"
    }
  ]
}
```

Each channel creates one `hub_job`.

Request key format:

```text
ORDER_COLLECT_{corpCd}_{channelCd}_{channelAccountId}_{frDt}_{toDt}
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
docker compose up -d
./gradlew bootRun
```

Local services:

- PostgreSQL: `localhost:5432`
- Kafka: `localhost:9092`
