-- External API client registry for BizBee HUB.
-- Purpose:
--   - issue a separated clientId/clientSecret per external system
--   - verify HMAC signatures without storing the secret in plain text
--   - support client-level disable, secret rotation, scopes, and audit tracking
--
-- Important:
--   HMAC verification requires the server to recover the shared secret.
--   Therefore client_secret_enc stores the secret encrypted with the HUB AES key.
--   client_secret_fingerprint is a SHA-256 fingerprint for duplicate/audit checks,
--   not a replacement for the encrypted secret.

CREATE TABLE IF NOT EXISTS hub_external_api_client (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    client_name VARCHAR(100) NOT NULL,
    client_id VARCHAR(80) NOT NULL UNIQUE,
    client_secret_enc TEXT NOT NULL,
    client_secret_fingerprint VARCHAR(64) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    token_ttl_seconds INT NOT NULL DEFAULT 1800,
    signature_valid_seconds INT NOT NULL DEFAULT 300,
    allowed_ips JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_called_at TIMESTAMPTZ,
    secret_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_user
ON hub_external_api_client (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_status
ON hub_external_api_client (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_last_called
ON hub_external_api_client (last_called_at DESC);

COMMENT ON TABLE hub_external_api_client IS 'External API clients allowed to request short-lived JWT tokens via HMAC signature.';
COMMENT ON COLUMN hub_external_api_client.client_secret_enc IS 'AES-encrypted client secret. Plain text is shown only once at issue/rotation time.';
COMMENT ON COLUMN hub_external_api_client.client_secret_fingerprint IS 'SHA-256 fingerprint of the client secret for audit and duplicate checks.';
COMMENT ON COLUMN hub_external_api_client.scopes IS 'Allowed external API scopes, for example ["orders:read", "delivery:read"].';
COMMENT ON COLUMN hub_external_api_client.allowed_ips IS 'Optional IP allowlist. Empty array means no IP restriction.';
