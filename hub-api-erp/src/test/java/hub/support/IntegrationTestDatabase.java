package hub.support;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

public final class IntegrationTestDatabase {

    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("hub_db")
            .withUsername("hub")
            .withPassword("hub-test");

    private static final DataSource DATA_SOURCE;

    static {
        POSTGRES.start();
        DATA_SOURCE = createDataSource();
        initializeSchema(DATA_SOURCE);
    }

    private IntegrationTestDatabase() {
    }

    public static DataSource dataSource() {
        return DATA_SOURCE;
    }

    private static DataSource createDataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.postgresql.Driver");
        dataSource.setUrl(POSTGRES.getJdbcUrl());
        dataSource.setUsername(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        return dataSource;
    }

    private static void initializeSchema(DataSource dataSource) {
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        jdbcTemplate.update("""
                INSERT INTO hub_corp (corp_cd, corp_name)
                VALUES ('TEST-DEFAULT', 'Integration Test Corp')
                ON CONFLICT (corp_cd) DO NOTHING
                """);
        Long defaultCorpId = jdbcTemplate.queryForObject(
                "SELECT id FROM hub_corp WHERE corp_cd = 'TEST-DEFAULT'", Long.class);
        jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN corp_id SET DEFAULT " + defaultCorpId);
    }
}
