package hub.erp.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@DependsOn({"erpApplySchemaInitializer", "hubJobSchemaInitializer"})
@RequiredArgsConstructor
public class ManualErpApplySchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_erp_apply_command (
                    id BIGSERIAL PRIMARY KEY,
                    command_id VARCHAR(100) NOT NULL UNIQUE,
                    corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    client_request_id VARCHAR(100) NOT NULL,
                    erp_connection_id VARCHAR(100) NOT NULL,
                    operation VARCHAR(30) NOT NULL,
                    reason VARCHAR(500),
                    status VARCHAR(30) NOT NULL,
                    requested_count INT NOT NULL,
                    accepted_count INT NOT NULL DEFAULT 0,
                    skipped_count INT NOT NULL DEFAULT 0,
                    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    skipped_order_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (corp_id, client_request_id)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_erp_apply_command_job (
                    id BIGSERIAL PRIMARY KEY,
                    command_id VARCHAR(100) NOT NULL REFERENCES hub_erp_apply_command(command_id) ON DELETE CASCADE,
                    job_request_id VARCHAR(100) NOT NULL REFERENCES hub_job(request_id),
                    source_normalize_job_id VARCHAR(100) NOT NULL,
                    order_count INT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (command_id, job_request_id)
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_command_corp_created
                ON hub_erp_apply_command(corp_id, created_at DESC)
                """);
    }
}