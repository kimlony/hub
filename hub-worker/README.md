# hub-worker

Kafka `hub.jobs` messages are processed by channel-specific order collectors.
The worker now stores collection results only in PostgreSQL.

## Stack

| Area | Tech |
| --- | --- |
| Runtime | Node.js + TypeScript |
| Queue | Kafka (`kafkajs`) |
| Database | PostgreSQL (`pg`) |
| HTTP | Express |
| Logging | Pino |

## Runtime Roles

`WORKER_ROLE` controls which process starts:

| Role | Behavior |
| --- | --- |
| `consumer` | Consumes Kafka jobs and runs order collection |
| `recovery` | Reclaims old queued/processing jobs |
| `http` | Starts the worker HTTP server |
| `all` | Starts all roles in one process, useful for local dev |

PM2 uses `ecosystem.config.cjs` to run:

- 4 consumer processes
- 1 recovery process
- 1 HTTP process

## Result Storage

Collected orders are saved to PostgreSQL table `hub_job_result`.

Core columns:

| Column | Description |
| --- | --- |
| `request_id` | HUB job request id |
| `request_key` | Deduplication key |
| `job_type` | Job type, for example `ORDER_COLLECT` |
| `source_erp` | Source system |
| `result_payload` | Collected result JSON |
| `saved_at` | Save timestamp |

No Oracle connection or Oracle client is required.

## Environment

Create `.env` from `.env.example`.

```env
PORT=3001
LOG_LEVEL=info
JOB_LOCK_TTL_MINUTES=30

POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DATABASE=hub_db
POSTGRES_USER=hub
POSTGRES_PASSWORD=change-me

HUB_AES_SECRET=change-me-32-byte-secret-local!!

KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=hub.jobs
KAFKA_GROUP_ID=hub-worker-group
KAFKA_CLIENT_ID=hub-worker

ELEVENST_API_KEY_OVERRIDE=
```

`HUB_AES_SECRET` must be exactly 32 bytes and must match the API service.

## Commands

```bash
npm install
npm run check
npm run build
npm start
```

PM2:

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 logs
```

Docker Compose can scale consumer processes later with:

```bash
docker compose up -d --scale hub-worker-consumer=4
```
