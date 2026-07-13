CREATE TABLE IF NOT EXISTS hub_job_attempt (
    id BIGSERIAL PRIMARY KEY,
    attempt_id UUID NOT NULL,
    request_id VARCHAR(100) NOT NULL REFERENCES hub_job(request_id) ON DELETE CASCADE,
    job_type VARCHAR(100) NOT NULL,
    fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
    worker_id VARCHAR(120) NOT NULL,
    claim_source VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms BIGINT,
    error_code VARCHAR(100),
    error_message TEXT,
    stale_rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uidx_hub_job_attempt_attempt_id UNIQUE (attempt_id),
    CONSTRAINT uidx_hub_job_attempt_request_fencing UNIQUE (request_id, fencing_token),
    CONSTRAINT chk_hub_job_attempt_claim_source
        CHECK (claim_source IN ('KAFKA', 'RECOVERY', 'MANUAL', 'MIGRATION')),
    CONSTRAINT chk_hub_job_attempt_status
        CHECK (status IN ('PROCESSING', 'SUCCESS', 'RETRY', 'FAILED', 'EXPIRED')),
    CONSTRAINT chk_hub_job_attempt_completion
        CHECK (
            (status = 'PROCESSING' AND completed_at IS NULL)
            OR (status <> 'PROCESSING' AND completed_at IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_hub_job_attempt_request_claimed
    ON hub_job_attempt(request_id, claimed_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_hub_job_attempt_metrics
    ON hub_job_attempt(job_type, claimed_at)
    WHERE completed_at IS NOT NULL OR status = 'EXPIRED' OR stale_rejected_at IS NOT NULL;

-- Existing PROCESSING rows predate durable attempt history. Preserve their current
-- execution token once so their terminal transition remains observable after deploy.
INSERT INTO hub_job_attempt (
    attempt_id, request_id, job_type, fencing_token, worker_id, claim_source,
    status, claimed_at, lease_until, created_at, updated_at
)
SELECT
    processing_attempt_id,
    request_id,
    job_type,
    fencing_token,
    claimed_by,
    'MIGRATION',
    'PROCESSING',
    COALESCE(processing_started_at, updated_at, NOW()),
    lease_until,
    NOW(),
    NOW()
FROM hub_job
WHERE status = 'PROCESSING'
  AND processing_attempt_id IS NOT NULL
  AND claimed_by IS NOT NULL
  AND lease_until IS NOT NULL
  AND fencing_token > 0
ON CONFLICT (request_id, fencing_token) DO NOTHING;

COMMENT ON TABLE hub_job_attempt IS 'Immutable-per-attempt execution history; hub_job retains only current ownership state.';
