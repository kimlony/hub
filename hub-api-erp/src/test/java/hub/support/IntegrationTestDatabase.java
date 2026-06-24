package hub.support;

import hub.external.schema.ExternalApiClientSchemaInitializer;
import hub.order.schema.OrderNormalizeSchemaInitializer;
import hub.schedule.schema.CollectScheduleSchemaInitializer;
import java.sql.Connection;
import javax.sql.DataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
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
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        runScript(dataSource, "db/init-auth.sql");
        new ExternalApiClientSchemaInitializer(jdbcTemplate).initialize();
        new CollectScheduleSchemaInitializer(jdbcTemplate).initialize();
        new OrderNormalizeSchemaInitializer(jdbcTemplate).initialize();
        initializeOutbox(jdbcTemplate);
    }

    private static void runScript(DataSource dataSource, String location) {
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource(location));
        } catch (Exception exception) {
            throw new IllegalStateException("failed to initialize test database from " + location, exception);
        }
    }

    private static void initializeOutbox(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_job_outbox (
                    id BIGSERIAL PRIMARY KEY,
                    request_id VARCHAR(100) NOT NULL,
                    event_type VARCHAR(50) NOT NULL,
                    topic VARCHAR(120) NOT NULL,
                    partition_key VARCHAR(200) NOT NULL,
                    payload JSONB NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    retry_count INT NOT NULL DEFAULT 0,
                    max_retry_count INT NOT NULL DEFAULT 5,
                    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    locked_by VARCHAR(120),
                    locked_at TIMESTAMPTZ,
                    last_error TEXT,
                    published_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_hub_job_outbox_status_retry
                ON hub_job_outbox (status, next_retry_at)
                """);
    }
}
