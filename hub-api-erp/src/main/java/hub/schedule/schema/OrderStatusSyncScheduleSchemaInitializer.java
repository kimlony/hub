package hub.schedule.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@RequiredArgsConstructor
public class OrderStatusSyncScheduleSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_order_status_sync_schedule (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    schedule_name VARCHAR(100) NOT NULL,
                    mall_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
                    channel_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                    status_types JSONB NOT NULL,
                    schedule_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED_TIME',
                    interval_hours INT,
                    date_range_type VARCHAR(30) NOT NULL,
                    run_time TIME NOT NULL,
                    enabled_yn CHAR(1) NOT NULL DEFAULT 'Y',
                    running_yn CHAR(1) NOT NULL DEFAULT 'N',
                    last_run_at TIMESTAMPTZ,
                    next_run_at TIMESTAMPTZ NOT NULL,
                    last_error_message TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_user
                ON hub_order_status_sync_schedule (user_id, created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_due
                ON hub_order_status_sync_schedule (enabled_yn, running_yn, next_run_at)
                """);
        jdbcTemplate.execute("""
                ALTER TABLE hub_order_status_sync_schedule
                ADD COLUMN IF NOT EXISTS schedule_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED_TIME'
                """);
        jdbcTemplate.execute("""
                ALTER TABLE hub_order_status_sync_schedule
                ADD COLUMN IF NOT EXISTS interval_hours INT
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_order_status_sync_schedule_run_log (
                    id BIGSERIAL PRIMARY KEY,
                    schedule_id BIGINT REFERENCES hub_order_status_sync_schedule(id) ON DELETE SET NULL,
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    schedule_name VARCHAR(100) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    mall_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
                    channel_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                    status_types JSONB NOT NULL,
                    date_range_type VARCHAR(30) NOT NULL,
                    fr_dt VARCHAR(8) NOT NULL,
                    to_dt VARCHAR(8) NOT NULL,
                    job_count INT NOT NULL DEFAULT 0,
                    request_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                    error_message TEXT,
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    finished_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_run_log_user
                ON hub_order_status_sync_schedule_run_log (user_id, created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_order_status_sync_schedule_run_log_schedule
                ON hub_order_status_sync_schedule_run_log (schedule_id, created_at DESC)
                """);
    }
}
