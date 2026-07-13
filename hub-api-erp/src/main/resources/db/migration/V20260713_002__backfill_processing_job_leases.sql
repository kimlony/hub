UPDATE hub_job
SET processing_attempt_id = COALESCE(processing_attempt_id, gen_random_uuid()),
    claimed_by = COALESCE(claimed_by, 'migration-backfill'),
    lease_until = COALESCE(lease_until, NOW() - INTERVAL '1 second'),
    processing_started_at = COALESCE(processing_started_at, updated_at, NOW()),
    fencing_token = CASE WHEN fencing_token > 0 THEN fencing_token ELSE 1 END
WHERE status = 'PROCESSING'
  AND (
    processing_attempt_id IS NULL
    OR claimed_by IS NULL
    OR lease_until IS NULL
    OR fencing_token <= 0
  );

ALTER TABLE hub_job
    ADD CONSTRAINT chk_hub_job_processing_execution_fields
    CHECK (
      status <> 'PROCESSING'
      OR (
        processing_attempt_id IS NOT NULL
        AND claimed_by IS NOT NULL
        AND lease_until IS NOT NULL
        AND fencing_token > 0
      )
    );