package hub.order.export.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@DependsOn("erpApplySchemaInitializer")
@RequiredArgsConstructor
public class OrderExportSchemaInitializer {
    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_order_export_file (
                    id BIGSERIAL PRIMARY KEY,
                    export_id VARCHAR(100) NOT NULL UNIQUE,
                    corp_id BIGINT NOT NULL,
                    user_id BIGINT,
                    export_type VARCHAR(30) NOT NULL,
                    status VARCHAR(30) NOT NULL,
                    file_name VARCHAR(255),
                    file_path TEXT,
                    total_count INT NOT NULL DEFAULT 0,
                    filter_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    error_message TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    completed_at TIMESTAMPTZ
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_export_file_corp_created
                ON hub_order_export_file(corp_id, created_at DESC)
                """);
    }
}
