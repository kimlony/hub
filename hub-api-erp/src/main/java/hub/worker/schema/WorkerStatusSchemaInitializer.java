package hub.worker.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@RequiredArgsConstructor
public class WorkerStatusSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_worker_heartbeat (
                    worker_id VARCHAR(100) PRIMARY KEY,
                    role VARCHAR(30) NOT NULL,
                    pid INT NOT NULL,
                    hostname VARCHAR(120) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    started_at TIMESTAMPTZ NOT NULL,
                    last_seen_at TIMESTAMPTZ NOT NULL,
                    heartbeat_interval_seconds INT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_worker_heartbeat_role
                ON hub_worker_heartbeat (role, last_seen_at)
                """);
        jdbcTemplate.execute("""
                DELETE FROM hub_worker_heartbeat
                WHERE status <> 'ONLINE'
                   OR last_seen_at < NOW() - INTERVAL '2 minutes'
                """);
    }
}
