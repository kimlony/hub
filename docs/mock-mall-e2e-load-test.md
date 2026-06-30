# Mock Mall e2e 부하 테스트 실행 가이드

이 문서는 화면 기반 Mock Mall e2e 부하 테스트를 다시 실행하고, 결과를 비교하고, 테스트 후 기존 개발 환경으로 되돌리는 방법을 정리합니다.

결과는 `hub_load_test_run` 테이블에 저장됩니다.

## 전제 조건

- Docker Desktop 실행
- PostgreSQL/Kafka Docker Compose 실행
- Hub API 실행
- Frontend 실행
- 시나리오에 맞는 Worker consumer 실행

API를 IntelliJ에서 실행하는 경우:

```text
Main class: hub.BizbeeHubApplication
Active profiles: local
```

## 공통 비교 기준

1p/1w와 4p/4w는 아래 값을 동일하게 맞춥니다.

| 항목 | 값 |
| --- | --- |
| Orders | `100000` |
| Page size | `100` |
| Seed | `mock-load-test-ui-001` |
| Error rate | `0` |
| Timeout rate | `0` |
| Delay ms | `0` |

비교 결과를 남기려면 `hub_load_test_run`은 삭제하지 않습니다.

## 테스트 데이터 정리

부하 테스트 주문/Job 데이터만 정리하고, 결과 비교 테이블은 유지합니다.

이미 정리용 SQL 파일이 있습니다.

```text
docs/cleanup-mock-mall-load-test.sql
```

PostgreSQL 클라이언트에서 해당 SQL을 실행합니다.

## 1p/1w 실행

### 1. API topic 설정

IntelliJ Run Configuration의 Environment variables에 아래 값을 넣고 API를 재시작합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs.load.e2e.1p
HUB_SCHEDULE_CRAWL_ENABLED=false
```

PowerShell에서 API를 실행한다면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs.load.e2e.1p"
$env:HUB_SCHEDULE_CRAWL_ENABLED="false"
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
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
| Orders | `100000` |
| Page size | `100` |
| Scenario | `e2e-1p-1w` |
| Seed | `mock-load-test-ui-001` |
| Delay ms | `0` |
| Error rate | `0` |
| Timeout rate | `0` |

## 4p/4w 실행

### 1. API topic 설정

IntelliJ Run Configuration의 Environment variables에 아래 값을 넣고 API를 재시작합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs.load.e2e.4p
HUB_SCHEDULE_CRAWL_ENABLED=false
```

PowerShell에서 API를 실행한다면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs.load.e2e.4p"
$env:HUB_SCHEDULE_CRAWL_ENABLED="false"
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

### 2. Worker consumer 4개 실행

```powershell
docker rm -f hub-worker-consumer-1p hub-worker-consumer-4p-1 hub-worker-consumer-4p-2 hub-worker-consumer-4p-3 hub-worker-consumer-4p-4
```

```powershell
docker compose run -d --name hub-worker-consumer-4p-1 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-2 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-3 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
docker compose run -d --name hub-worker-consumer-4p-4 -e WORKER_ROLE=consumer -e KAFKA_TOPIC=hub.jobs.load.e2e.4p -e KAFKA_GROUP_ID=hub-worker-e2e-4p hub-worker-consumer
```

### 3. 화면에서 실행

| 항목 | 값 |
| --- | --- |
| Orders | `100000` |
| Page size | `100` |
| Scenario | `e2e-4p-4w` |
| Seed | `mock-load-test-ui-001` |
| Delay ms | `0` |
| Error rate | `0` |
| Timeout rate | `0` |

## 결과 비교 SQL

최근 실행 결과:

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

최근 1p/1w와 4p/4w 비교:

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

## 측정 결과

| Scenario | Orders | Normalized | Elapsed | Orders/sec | Jobs/sec | P95 job ms | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `e2e-1p-1w` | 100000 | 100000 | 20m 14s | 82.4 | 1.6 | 807728.5 | 0 |
| `e2e-4p-4w` | 100000 | 100000 | 6m 28s | 257.7 | 5.2 | 152757.8 | 0 |

요약:

- 전체 처리 시간은 1214초에서 388초로 감소했습니다.
- 처리 시간은 약 68.0% 단축되었습니다.
- 주문 처리량은 약 3.13배 증가했습니다.
- Job 처리량은 약 3.25배 증가했습니다.
- p95 Job 시간은 약 81.1% 감소했습니다.
- 실패 Job은 두 조건 모두 0건입니다.

## 기존 개발 환경으로 되돌리기

### 1. 테스트 consumer 정리

```powershell
docker rm -f hub-worker-consumer-1p hub-worker-consumer-4p-1 hub-worker-consumer-4p-2 hub-worker-consumer-4p-3 hub-worker-consumer-4p-4
```

### 2. 기본 Docker Compose worker 사용

```powershell
docker compose up -d hub-worker-consumer hub-worker-recovery hub-worker-http
```

### 3. API topic 기본값 복원

IntelliJ Run Configuration에서 테스트용 환경변수를 제거하거나 기본값으로 변경합니다.

```text
HUB_KAFKA_TOPICS_JOBS=hub.jobs
HUB_SCHEDULE_CRAWL_ENABLED=true
```

PowerShell에서 실행한다면:

```powershell
cd C:\Users\Scrap-2\bizbee-hub\hub-api-erp
$env:HUB_KAFKA_TOPICS_JOBS="hub.jobs"
$env:HUB_SCHEDULE_CRAWL_ENABLED="true"
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

### 4. 결과 기록 삭제가 필요할 때만 실행

비교 기록까지 지우고 싶을 때만 실행합니다.

```sql
DELETE FROM hub_load_test_run
WHERE mode = 'mock-mall-e2e';
```
