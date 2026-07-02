package hub.erp.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@DependsOn("orderNormalizeSchemaInitializer")
@RequiredArgsConstructor
public class ErpApplySchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
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
