package hub.job.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HubJobSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS parent_job_id VARCHAR(100)");
        jdbcTemplate.execute("ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100)");
        jdbcTemplate.execute("ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS causation_id VARCHAR(100)");
        jdbcTemplate.execute("ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS schema_version VARCHAR(20)");
        jdbcTemplate.execute("ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS payload_version VARCHAR(20)");
        jdbcTemplate.execute("""
                UPDATE hub_job
                SET correlation_id = COALESCE(correlation_id, request_id),
                    schema_version = COALESCE(schema_version, '1.0'),
                    payload_version = COALESCE(payload_version, '1.0')
                WHERE correlation_id IS NULL
                   OR schema_version IS NULL
                   OR payload_version IS NULL
                """);
        jdbcTemplate.execute("ALTER TABLE hub_job ALTER COLUMN correlation_id SET NOT NULL");
        jdbcTemplate.execute("ALTER TABLE hub_job ALTER COLUMN schema_version SET NOT NULL");
        jdbcTemplate.execute("ALTER TABLE hub_job ALTER COLUMN payload_version SET NOT NULL");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_hub_job_parent_job_id ON hub_job(parent_job_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_hub_job_correlation_id ON hub_job(correlation_id)");
    }
}
