package com.bizbee.hub.schedule;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

@Component
@RequiredArgsConstructor
public class CollectScheduleSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_collect_schedule (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    schedule_name VARCHAR(100) NOT NULL,
                    mall_keys JSONB NOT NULL,
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
                CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_user
                ON hub_collect_schedule (user_id, created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_due
                ON hub_collect_schedule (enabled_yn, running_yn, next_run_at)
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_collect_schedule_run_log (
                    id BIGSERIAL PRIMARY KEY,
                    schedule_id BIGINT REFERENCES hub_collect_schedule(id) ON DELETE SET NULL,
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    schedule_name VARCHAR(100) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    mall_keys JSONB NOT NULL,
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
                CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_run_log_user
                ON hub_collect_schedule_run_log (user_id, created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_collect_schedule_run_log_schedule
                ON hub_collect_schedule_run_log (schedule_id, created_at DESC)
                """);
    }
}
