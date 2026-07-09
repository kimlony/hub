package hub.erp.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@DependsOn("orderNormalizeSchemaInitializer")
@RequiredArgsConstructor
public class ErpApplySchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_erp_connection (
                    id BIGSERIAL PRIMARY KEY,
                    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
                    erp_connection_id VARCHAR(100) NOT NULL,
                    erp_type VARCHAR(50) NOT NULL DEFAULT 'MOCK',
                    base_url VARCHAR(500),
                    auth_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
                    token_url VARCHAR(500),
                    client_id VARCHAR(200),
                    client_secret TEXT,
                    access_token TEXT,
                    refresh_token TEXT,
                    token_expires_at TIMESTAMPTZ,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (corp_id, erp_connection_id),
                    UNIQUE (erp_connection_id)
                )
                """);
        // TODO(security): encrypt client_secret/access_token/refresh_token before production use.
        jdbcTemplate.execute("""
                INSERT INTO hub_erp_connection (corp_id, erp_connection_id, erp_type, auth_type, is_active)
                SELECT id, 'MOCK-' || id::text, 'MOCK', 'NONE', TRUE
                FROM hub_corp
                ON CONFLICT (corp_id, erp_connection_id) DO NOTHING
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_erp_apply_result (
                    id BIGSERIAL PRIMARY KEY,
                    request_id VARCHAR(100) NOT NULL,
                    correlation_id VARCHAR(100) NOT NULL,
                    normalized_order_id BIGINT NOT NULL REFERENCES hub_collected_order(id),
                    erp_connection_id VARCHAR(100) NOT NULL,
                    operation VARCHAR(30) NOT NULL,
                    status VARCHAR(30) NOT NULL,
                    idempotency_key VARCHAR(200) NOT NULL,
                    erp_document_no VARCHAR(120),
                    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    error_code VARCHAR(100),
                    error_message TEXT,
                    attempt_count INT NOT NULL DEFAULT 0,
                    applied_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (idempotency_key, normalized_order_id)
                )
                """);
        jdbcTemplate.execute("""
                ALTER TABLE hub_erp_apply_result
                    ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(30) NOT NULL DEFAULT 'ERP_PUSH',
                    ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(30) NOT NULL DEFAULT 'AUTO',
                    ADD COLUMN IF NOT EXISTS external_client_id BIGINT NULL,
                    ADD COLUMN IF NOT EXISTS delivered_by_user_id BIGINT NULL,
                    ADD COLUMN IF NOT EXISTS delivery_note TEXT NULL
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_request
                ON hub_erp_apply_result(request_id)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_status
                ON hub_erp_apply_result(status, updated_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_correlation
                ON hub_erp_apply_result(correlation_id, created_at ASC)
                """);
    }
}
