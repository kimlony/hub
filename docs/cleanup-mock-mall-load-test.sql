-- Mock Mall load-test cleanup.
--
-- Usage:
--   1. Stop worker consumers before running this script.
--   2. Run against the local/test PostgreSQL database only.
--   3. Commit before running a new benchmark so old queued jobs do not affect results.
--
-- This script deletes only MOCK_MALL load-test data. It does not delete real
-- channel jobs such as 11ST, COUPANG, GODO, GCHAN, NSS, DART, or NAVER_RSS.

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

DO $$
DECLARE
    deleted_load_test_runs INTEGER := 0;
BEGIN
    IF to_regclass('public.hub_load_test_run') IS NOT NULL THEN
        DELETE FROM hub_load_test_run
        WHERE mode IN ('mock-mall', 'mock-mall-e2e')
           OR params ->> 'scenario' LIKE '%mock%'
           OR params ->> 'seed' LIKE 'mock-%';

        GET DIAGNOSTICS deleted_load_test_runs = ROW_COUNT;
    END IF;

    RAISE NOTICE 'deleted_load_test_runs=%', deleted_load_test_runs;
END $$;

COMMIT;
