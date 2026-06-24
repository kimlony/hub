# Mock Mall e2e 부하 테스트 실행 가이드

이 문서는 화면 기반 Mock Mall e2e 부하 테스트를 다시 실행하고, 결과를 비교하고, 테스트가 끝난 뒤 기존 개발 환경으로 되돌리는 방법을 정리합니다.

## 전제 조건

- Docker Desktop 실행
- PostgreSQL/Kafka Docker Compose 스택 실행
- Hub API 실행
- Frontend 실행
- Worker consumer는 테스트 시나리오에 맞게 별도 실행

테스트 결과는 `hub_load_test_run` 테이블에 저장됩니다.

## 공정한 비교 기준

1p/1w와 4p/4w는 아래 값을 동일하게 맞춥니다.

| 항목 | 값 |
| --- | --- |
| 주문 수 | `100000` |
| Page size | `100` |
| Seed | `mock-load-test-ui-001` |
| Error rate | `0` |
| Timeout rate | `0` |
| Delay ms | `0` |

테스트 간에는 Mock Mall 작업/주문 데이터만 삭제하고, `hub_load_test_run` 결과는 남깁니다.

## 테스트 데이터 정리

비교 결과를 남기려면 `hub_load_test_run`은 삭제하지 않습니다.

PostgreSQL에서 아래 쿼리를 실행합니다.

```sql
BEGIN;

WITH target_collect_jobs AS (
    SELECT request_id, request_key
    FROM hub_job
    WHERE channel_cd = 'MOCK_MALL'
       OR payload ->> 'channelCd' = 'MOCK_MALL'
       OR request_key LIKE '%_MOCK_MALL_%'
),
target_normalize_jobs AS (
    SELECT j.request_id, j.request_key
    FROM hub_job j
    JOIN target_collect_jobs c
      ON j.request_key = 'NORMALIZE_' || c.request_id
),
target_jobs AS (
    SELECT request_id, request_key FROM target_collect_jobs
    UNION
    SELECT request_id, request_key FROM target_normalize_jobs
),
deleted_checkpoints AS (
    DELETE FROM hub_order_normalize_checkpoint checkpoint
    USING target_collect_jobs c
    WHERE checkpoint.request_id = c.request_id
    RETURNING checkpoint.request_id
),
deleted_orders AS (
    DELETE FROM hub_collected_order orders
    USING target_collect_jobs c
    WHERE orders.request_id = c.request_id
       OR orders.channel_cd = 'MOCK_MALL'
    RETURNING orders.id
),
deleted_results AS (
    DELETE FROM hub_job_result result
    USING target_collect_jobs c
    WHERE result.request_id = c.request_id
    RETURNING result.request_id
),
deleted_outbox AS (
    DELETE FROM hub_job_outbox outbox
    USING target_jobs j
    WHERE outbox.request_id = j.request_id
       OR outbox.payload -> 'payload' ->> 'channelCd' = 'MOCK_MALL'
       OR outbox.topic LIKE 'hub.jobs.load%'
    RETURNING outbox.id
),
deleted_logs AS (
    DELETE FROM hub_job_log log
    USING target_jobs j
    WHERE log.request_id = j.request_id
    RETURNING log.id
),
deleted_locks AS (
    DELETE FROM hub_job_lock
    WHERE lock_key LIKE 'ORDER_COLLECT:%:mock-mall-001%'
       OR lock_key LIKE 'ORDER_COLLECT:%:MOCK_MALL%'
    RETURNING lock_key
),
deleted_jobs AS (
    DELETE FROM hub_job job
    USING target_jobs j
    WHERE job.request_id = j.request_id
    RETURNING job.request_id
)
SELECT
    (SELECT COUNT(*) FROM deleted_checkpoints) AS deleted_checkpoints,
    (SELECT COUNT(*) FROM deleted_orders) AS deleted_orders,
    (SELECT COUNT(*) FROM deleted_results) AS deleted_results,
    (SELECT COUNT(*) FROM deleted_outbox) AS deleted_outbox,
    (SELECT COUNT(*) FROM deleted_logs) AS deleted_logs,
    (SELECT COUNT(*) FROM deleted_locks) AS deleted_locks,
    (SELECT COUNT(*) FROM deleted_jobs) AS deleted_jobs;

COMMIT;
```

## 1p/1w 실행

### 1. API 토픽 설정

IntelliJ Run Configuration에 아래 환경변수를 설정하고 API를 재시작합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs.load.e2e.1p
HUB_SCHEDULE_CRAWL_ENABLED=false
```

PowerShell에서 API를 실행한다면 아래처럼 실행합니다.

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs.load.e2e.1p"
$env:HUB_SCHEDULE_CRAWL_ENABLED="false"
.\gradlew.bat bootRun
```

### 2. Worker consumer 실행

기존 테스트 consumer를 정리합니다.

```powershell
docker rm -f hub-worker-consumer-1p hub-worker-consumer-4p-1 hub-worker-consumer-4p-2 hub-worker-consumer-4p-3 hub-worker-consumer-4p-4
```

1개 consumer를 실행합니다.

```powershell
docker compose run -d --name hub-worker-consumer-1p -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.1p -e KAFKA_GROUP_ID=hub-worker-e2e-1p hub-worker-consumer
```

### 3. 화면에서 실행

대용량 데이터 테스트 화면에서 아래 값으로 실행합니다.

| 항목 | 값 |
| --- | --- |
| 주문 수 | `100000` |
| Page size | `100` |
| Scenario | `e2e-1p-1w` |
| Seed | `mock-load-test-ui-001` |
| Delay ms | `0` |
| Error rate | `0` |
| Timeout rate | `0` |

## 4p/4w 실행

### 1. API 토픽 설정

IntelliJ Run Configuration에 아래 환경변수를 설정하고 API를 재시작합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs.load.e2e.4p
HUB_SCHEDULE_CRAWL_ENABLED=false
```

PowerShell에서 API를 실행한다면 아래처럼 실행합니다.

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs.load.e2e.4p"
$env:HUB_SCHEDULE_CRAWL_ENABLED="false"
.\gradlew.bat bootRun
```

### 2. Worker consumer 4개 실행

기존 테스트 consumer를 정리합니다.

```powershell
docker rm -f hub-worker-consumer-1p hub-worker-consumer-4p-1 hub-worker-consumer-4p-2 hub-worker-consumer-4p-3 hub-worker-consumer-4p-4
```

4개 consumer를 같은 group id로 실행합니다.

```powershell
docker compose run -d --name hub-worker-consumer-4p-1 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-2 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-3 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-4 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
```

### 3. 화면에서 실행

대용량 데이터 테스트 화면에서 아래 값으로 실행합니다.

| 항목 | 값 |
| --- | --- |
| 주문 수 | `100000` |
| Page size | `100` |
| Scenario | `e2e-4p-4w` |
| Seed | `mock-load-test-ui-001` |
| Delay ms | `0` |
| Error rate | `0` |
| Timeout rate | `0` |

## 결과 비교 쿼리

```sql
SELECT
    run_id,
    scenario,
    status,
    total_requested,
    normalized_orders,
    elapsed_ms,
    ROUND((elapsed_ms / 1000.0)::numeric, 1) AS elapsed_seconds,
    orders_per_second,
    jobs_per_second,
    p95_duration_ms,
    failed_jobs,
    started_at,
    completed_at
FROM hub_load_test_run
WHERE mode = 'mock-mall-e2e'
ORDER BY started_at DESC;
```

1p/1w와 4p/4w를 직접 비교하려면 아래 쿼리를 사용합니다.

```sql
WITH base AS (
    SELECT *
    FROM hub_load_test_run
    WHERE mode = 'mock-mall-e2e'
      AND scenario = 'e2e-1p-1w'
    ORDER BY started_at DESC
    LIMIT 1
),
parallel AS (
    SELECT *
    FROM hub_load_test_run
    WHERE mode = 'mock-mall-e2e'
      AND scenario = 'e2e-4p-4w'
    ORDER BY started_at DESC
    LIMIT 1
)
SELECT
    base.elapsed_ms AS baseline_elapsed_ms,
    parallel.elapsed_ms AS parallel_elapsed_ms,
    ROUND((base.elapsed_ms::numeric / NULLIF(parallel.elapsed_ms, 0)), 2) AS speedup_ratio,
    ROUND(((base.elapsed_ms - parallel.elapsed_ms) * 100.0 / NULLIF(base.elapsed_ms, 0))::numeric, 1) AS elapsed_reduction_percent,
    base.orders_per_second AS baseline_orders_per_second,
    parallel.orders_per_second AS parallel_orders_per_second,
    ROUND((parallel.orders_per_second::numeric / NULLIF(base.orders_per_second, 0)), 2) AS throughput_ratio,
    base.p95_duration_ms AS baseline_p95_ms,
    parallel.p95_duration_ms AS parallel_p95_ms,
    ROUND(((base.p95_duration_ms - parallel.p95_duration_ms) * 100.0 / NULLIF(base.p95_duration_ms, 0))::numeric, 1) AS p95_reduction_percent
FROM base
CROSS JOIN parallel;
```

## 이번 측정 결과

| Scenario | Orders | Normalized | Elapsed | Orders/sec | Jobs/sec | P95 job ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `e2e-1p-1w` | 100000 | 100000 | 20m 14s | 82.4 | 1.6 | 807728.5 | 0 |
| `e2e-4p-4w` | 100000 | 100000 | 6m 28s | 257.7 | 5.2 | 152757.8 | 0 |

요약:

- 전체 처리 시간은 1214초에서 388초로 줄었습니다.
- 처리 시간은 약 68.0% 단축되었습니다.
- 주문 처리량은 약 3.13배 증가했습니다.
- Job 처리량은 약 3.25배 증가했습니다.
- p95 Job 시간은 약 81.1% 감소했습니다.
- 실패 Job은 두 조건 모두 0건입니다.

## 기존 개발 환경으로 되돌리기

부하 테스트가 끝나면 테스트 전용 consumer를 정리하고, API 토픽을 기본값으로 되돌립니다.

### 1. 테스트 consumer 정리

```powershell
docker rm -f hub-worker-consumer-1p hub-worker-consumer-4p-1 hub-worker-consumer-4p-2 hub-worker-consumer-4p-3 hub-worker-consumer-4p-4
```

### 2. 기본 Docker Compose worker 사용

기존 compose worker를 다시 사용합니다.

```powershell
docker compose up -d hub-worker-consumer hub-worker-recovery hub-worker-http
```

### 3. API 환경변수 원복

IntelliJ Run Configuration에서 테스트용 토픽을 제거하거나 기본값으로 변경합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs
```

자동 뉴스/공시 수집을 다시 켜려면 아래 값을 제거하거나 `true`로 변경합니다.

```text
HUB_SCHEDULE_CRAWL_ENABLED=true
```

PowerShell에서 API를 실행한다면 새 터미널을 열거나 아래처럼 기본값으로 다시 실행합니다.

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs"
$env:HUB_SCHEDULE_CRAWL_ENABLED="true"
.\gradlew.bat bootRun
```

### 4. 기본 토픽 확인

Outbox에 새로 쌓이는 이벤트가 기본 토픽으로 저장되는지 확인합니다.

```sql
SELECT topic, status, COUNT(*)
FROM hub_job_outbox
GROUP BY topic, status
ORDER BY topic, status;
```

기본 개발 흐름에서는 일반 주문수집 Job이 `hub.jobs` 토픽을 사용해야 합니다.

### 5. 테스트 데이터 정리 선택

부하 테스트 주문 데이터가 필요 없으면 위의 테스트 데이터 정리 쿼리를 다시 실행합니다.

결과 비교 기록까지 지우고 싶을 때만 아래 쿼리를 추가로 실행합니다.

```sql
DELETE FROM hub_load_test_run
WHERE mode = 'mock-mall-e2e';
```
