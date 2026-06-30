package hub.tenant;

import hub.order.schema.OrderNormalizeSchemaInitializer;
import hub.tenant.schema.TenantSchemaInitializer;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class TenantSchemaMigrationIntegrationTest {

    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("hub_legacy")
            .withUsername("hub")
            .withPassword("hub-test");

    @BeforeAll
    static void startPostgres() {
        POSTGRES.start();
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    /**
     * 기존 복합 키 스키마가 회사와 채널 계정 기반 구조로 변환되는지 검증한다.
     */
    @Test
    void migratesLegacyCompositeMallKeyToCorpAndChannelAccountIdentity() {
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource());
        createLegacySchema(jdbcTemplate);
        insertLegacyData(jdbcTemplate);

        new TenantSchemaInitializer(jdbcTemplate).initialize();
        new OrderNormalizeSchemaInitializer(jdbcTemplate).initialize();

        Map<String, Object> migrated = jdbcTemplate.queryForMap("""
                SELECT
                    u.corp_id AS user_corp_id,
                    c.corp_cd,
                    m.id AS channel_account_id,
                    m.corp_id AS account_corp_id,
                    o.corp_id AS order_corp_id,
                    o.channel_account_id AS order_channel_account_id
                FROM users u
                JOIN hub_corp c ON c.id = u.corp_id
                JOIN user_malls m ON m.user_id = u.id AND m.mall_key = 'GODO'
                JOIN hub_collected_order o ON o.user_id = u.id AND o.channel_order_id = 'LEGACY-ORDER-1'
                WHERE u.username = 'legacy-user'
                """);

        Number userCorpId = (Number) migrated.get("user_corp_id");
        Number channelAccountId = (Number) migrated.get("channel_account_id");
        assertThat(migrated.get("corp_cd")).isEqualTo("LEGACY-1");
        assertThat(((Number) migrated.get("account_corp_id")).longValue()).isEqualTo(userCorpId.longValue());
        assertThat(((Number) migrated.get("order_corp_id")).longValue()).isEqualTo(userCorpId.longValue());
        assertThat(((Number) migrated.get("order_channel_account_id")).longValue())
                .isEqualTo(channelAccountId.longValue());

        List<String> primaryKeyColumns = jdbcTemplate.queryForList("""
                SELECT a.attname
                FROM pg_constraint c
                CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS key(attnum, position)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
                WHERE c.conrelid = 'user_malls'::regclass
                  AND c.contype = 'p'
                ORDER BY key.position
                """, String.class);
        assertThat(primaryKeyColumns).containsExactly("id");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.uidx_hub_collected_order_channel_order')",
                String.class)).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.uidx_hub_collected_order_account_order')",
                String.class)).isEqualTo("uidx_hub_collected_order_account_order");

        Long secondAccountId = jdbcTemplate.queryForObject("""
                INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
                VALUES (?, 1, 'GODO', 'GODO second', 'Y')
                RETURNING id
                """, Long.class, userCorpId.longValue());
        jdbcTemplate.update("""
                INSERT INTO hub_collected_order (
                    corp_id, channel_account_id, user_id, request_id, request_key,
                    source_erp, channel_cd, mall_key, channel_order_id, order_date
                ) VALUES (?, ?, 1, 'legacy-request-2', 'legacy-key-2',
                          'HUB', 'GODO', 'GODO', 'LEGACY-ORDER-1', NOW())
                """, userCorpId.longValue(), secondAccountId);

        Integer sameOrderNumberCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hub_collected_order WHERE channel_order_id = 'LEGACY-ORDER-1'",
                Integer.class);
        assertThat(sameOrderNumberCount).isEqualTo(2);
    }

    private static DataSource dataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.postgresql.Driver");
        dataSource.setUrl(POSTGRES.getJdbcUrl());
        dataSource.setUsername(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        return dataSource;
    }

    private void createLegacySchema(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute("""
                CREATE TABLE users (
                    id BIGSERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(60) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE user_malls (
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    mall_key VARCHAR(20) NOT NULL,
                    key VARCHAR(500),
                    key2 VARCHAR(500),
                    auth_key VARCHAR(500),
                    mall_id VARCHAR(255),
                    mall_pw VARCHAR(500),
                    use_yn CHAR(1) NOT NULL DEFAULT 'Y',
                    vendor_id VARCHAR(500),
                    PRIMARY KEY (user_id, mall_key)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE hub_collected_order (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id),
                    request_id VARCHAR(36),
                    request_key VARCHAR(200),
                    source_erp VARCHAR(50) NOT NULL DEFAULT 'HUB',
                    channel_cd VARCHAR(30) NOT NULL,
                    mall_key VARCHAR(50),
                    channel_order_id VARCHAR(120) NOT NULL,
                    order_status VARCHAR(80),
                    order_date TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE UNIQUE INDEX uidx_hub_collected_order_channel_order
                ON hub_collected_order(channel_cd, channel_order_id)
                """);
    }

    private void insertLegacyData(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.update("""
                INSERT INTO users (id, username, password)
                VALUES (1, 'legacy-user', 'legacy-password')
                """);
        jdbcTemplate.update("""
                INSERT INTO user_malls (user_id, mall_key, mall_id, use_yn)
                VALUES (1, 'GODO', 'encrypted-mall-id', 'Y')
                """);
        jdbcTemplate.update("""
                INSERT INTO hub_collected_order (
                    user_id, request_id, request_key, source_erp,
                    channel_cd, mall_key, channel_order_id, order_status, order_date
                ) VALUES (
                    1, 'legacy-request-1', 'legacy-key-1', 'HUB',
                    'GODO', 'GODO', 'LEGACY-ORDER-1', 'PAID', NOW()
                )
                """);
    }
}
