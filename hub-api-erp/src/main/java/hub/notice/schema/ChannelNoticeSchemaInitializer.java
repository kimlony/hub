package hub.notice.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@RequiredArgsConstructor
public class ChannelNoticeSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_channel_notice (
                    id BIGSERIAL PRIMARY KEY,
                    channel_cd VARCHAR(30) NOT NULL,
                    severity VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    message TEXT NOT NULL,
                    reason TEXT,
                    failure_count INT NOT NULL DEFAULT 0,
                    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    resolved_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_channel_notice_open
                ON hub_channel_notice (channel_cd)
                WHERE status = 'OPEN'
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_channel_notice_status
                ON hub_channel_notice (status, updated_at DESC)
                """);
    }
}
