ALTER TABLE hub_job
    ADD COLUMN IF NOT EXISTS processing_attempt_id UUID,
    ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(120),
    ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fencing_token BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_hub_job_processing_lease
    ON hub_job(lease_until)
    WHERE status = 'PROCESSING';

COMMENT ON COLUMN hub_job.processing_attempt_id IS 'Unique processing attempt identifier used to reject stale workers';
COMMENT ON COLUMN hub_job.claimed_by IS 'Worker instance that owns the current processing attempt';
COMMENT ON COLUMN hub_job.lease_until IS 'Expiry time after which recovery may issue a new processing attempt';
COMMENT ON COLUMN hub_job.processing_started_at IS 'Time at which the current processing attempt was issued';
COMMENT ON COLUMN hub_job.fencing_token IS 'Monotonically increasing token for processing ownership';