package com.bizbee.hub.external;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ExternalApiClientSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
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
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_user
                ON hub_external_api_client (user_id, created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_status
                ON hub_external_api_client (status, updated_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_external_api_client_last_called
                ON hub_external_api_client (last_called_at DESC)
                """);
    }
}
