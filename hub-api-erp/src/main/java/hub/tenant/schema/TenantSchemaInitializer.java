package hub.tenant.schema;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("legacy-schema-init")
@RequiredArgsConstructor
public class TenantSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void initialize() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_corp (
                    id BIGSERIAL PRIMARY KEY,
                    corp_cd VARCHAR(50) UNIQUE NOT NULL,
                    corp_name VARCHAR(200) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS corp_id BIGINT");
        jdbcTemplate.execute("""
                INSERT INTO hub_corp (corp_cd, corp_name)
                SELECT 'LEGACY-' || id, username
                FROM users
                WHERE corp_id IS NULL
                ON CONFLICT (corp_cd) DO NOTHING
                """);
        jdbcTemplate.execute("""
                UPDATE users u
                SET corp_id = c.id
                FROM hub_corp c
                WHERE u.corp_id IS NULL
                  AND c.corp_cd = 'LEGACY-' || u.id
                """);
        jdbcTemplate.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname IN ('fk_users_corp', 'users_corp_id_fkey')
                          AND conrelid = 'users'::regclass
                    ) THEN
                        ALTER TABLE users
                        ADD CONSTRAINT fk_users_corp FOREIGN KEY (corp_id) REFERENCES hub_corp(id);
                    END IF;
                END $$
                """);
        jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN corp_id SET NOT NULL");

        jdbcTemplate.execute("ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS id BIGSERIAL");
        jdbcTemplate.execute("ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS corp_id BIGINT");
        jdbcTemplate.execute("ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS account_name VARCHAR(100)");
        jdbcTemplate.execute("""
                UPDATE user_malls m
                SET corp_id = u.corp_id
                FROM users u
                WHERE m.user_id = u.id
                  AND m.corp_id IS NULL
                """);
        jdbcTemplate.execute("""
                UPDATE user_malls
                SET account_name = mall_key || '-' || id
                WHERE account_name IS NULL OR BTRIM(account_name) = ''
                """);
        jdbcTemplate.execute("""
                DO $$
                DECLARE
                    id_attnum SMALLINT;
                    current_key SMALLINT[];
                BEGIN
                    SELECT attnum INTO id_attnum
                    FROM pg_attribute
                    WHERE attrelid = 'user_malls'::regclass
                      AND attname = 'id';

                    SELECT conkey INTO current_key
                    FROM pg_constraint
                    WHERE conrelid = 'user_malls'::regclass
                      AND contype = 'p';

                    IF current_key IS DISTINCT FROM ARRAY[id_attnum] THEN
                        ALTER TABLE user_malls DROP CONSTRAINT IF EXISTS user_malls_pkey;
                        ALTER TABLE user_malls ADD CONSTRAINT user_malls_pkey PRIMARY KEY (id);
                    END IF;
                END $$
                """);
        jdbcTemplate.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname IN ('fk_user_malls_corp', 'user_malls_corp_id_fkey')
                          AND conrelid = 'user_malls'::regclass
                    ) THEN
                        ALTER TABLE user_malls
                        ADD CONSTRAINT fk_user_malls_corp FOREIGN KEY (corp_id) REFERENCES hub_corp(id);
                    END IF;
                END $$
                """);
        jdbcTemplate.execute("ALTER TABLE user_malls ALTER COLUMN corp_id SET NOT NULL");
        jdbcTemplate.execute("ALTER TABLE user_malls ALTER COLUMN account_name SET NOT NULL");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_user_malls_corp ON user_malls(corp_id, mall_key, use_yn)");
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_malls_mock_corp
                ON user_malls(corp_id, mall_key)
                WHERE mall_key = 'MOCK_MALL'
                """);
    }
}
