package com.bizbee.hub.mybatis;

import com.bizbee.hub.external.ExternalApiClientMapper;
import com.bizbee.hub.external.ExternalApiClientRow;
import com.bizbee.hub.outbox.JobOutbox;
import com.bizbee.hub.outbox.JobOutboxMapper;
import com.bizbee.hub.schedule.CollectScheduleMapper;
import com.bizbee.hub.schedule.CollectScheduleRow;
import com.bizbee.hub.schedule.CollectScheduleRunLogRow;
import com.bizbee.hub.support.IntegrationTestDatabase;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class MyBatisTypeMappingIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private ExternalApiClientMapper externalApiClientMapper;
    private CollectScheduleMapper collectScheduleMapper;
    private JobOutboxMapper jobOutboxMapper;
    private TransactionTemplate transactionTemplate;
    private String userPrefix;
    private String clientPrefix;
    private String schedulePrefix;
    private String requestPrefix;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        externalApiClientMapper = mapper(dataSource, ExternalApiClientMapper.class, "classpath:mapper/ExternalApiClientMapper.xml");
        collectScheduleMapper = mapper(dataSource, CollectScheduleMapper.class, "classpath:mapper/CollectScheduleMapper.xml");
        jobOutboxMapper = mapper(dataSource, JobOutboxMapper.class, "classpath:mapper/JobOutBoxMapper.xml");
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        userPrefix = "itusr-" + shortId();
        clientPrefix = "it-client-" + shortId();
        schedulePrefix = "it-schedule-" + shortId();
        requestPrefix = "it-mybatis-" + shortId();
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update(
                "DELETE FROM hub_job_outbox WHERE request_id LIKE ?",
                requestPrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM hub_collect_schedule_run_log WHERE schedule_name LIKE ?",
                schedulePrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM hub_collect_schedule WHERE schedule_name LIKE ?",
                schedulePrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM hub_external_api_client WHERE client_id LIKE ?",
                clientPrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM users WHERE username LIKE ?",
                userPrefix + "%"
        );
    }

    /**
     * hub_external_api_client의 scopes, allowed_ips 같은 jsonb 컬럼과 created_at, updated_at, secret_rotated_at
     * 같은 TIMESTAMPTZ 컬럼이 ExternalApiClientMapper에서 문자열로 안전하게 매핑되는지 검증합니다.
     */
    @Test
    void externalApiClientMapperMapsJsonbAndTimestamptzColumnsAsStrings() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String clientId = insertExternalClient(userId);

            ExternalApiClientRow row = externalApiClientMapper.findByClientId(clientId).orElseThrow();

            assertThat(row.getScopesJson()).contains("orders:read", "orders:write");
            assertThat(row.getAllowedIpsJson()).contains("127.0.0.1");
            assertThat(row.getSecretRotatedAt()).isEqualTo("2026-06-18 10:20:30");
            assertThat(row.getCreatedAt()).isEqualTo("2026-06-18 10:20:30");
            assertThat(row.getUpdatedAt()).isEqualTo("2026-06-18 10:20:30");
            return null;
        });
    }

    /**
     * hub_collect_schedule, hub_collect_schedule_run_log의 mall_keys,
     * request_ids JSONB와 실행 시간 컬럼들이 to_char(... AT TIME ZONE 'Asia/Seoul') 결과로 안전하게 내려오는지 검증합니다.
     */
    @Test
    void collectScheduleMapperMapsJsonbAndTimestamptzColumnsAsStrings() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(userId);
            insertScheduleRunLog(scheduleId, userId);

            List<CollectScheduleRow> schedules = collectScheduleMapper.findByUserId(userId);
            List<CollectScheduleRunLogRow> logs = collectScheduleMapper.findRunLogsByUserId(userId, 10);

            assertThat(schedules).hasSize(1);
            assertThat(schedules.get(0).getMallKeysJson()).contains("GODO", "NSS");
            assertThat(schedules.get(0).getNextRunAt()).isEqualTo("2026-06-18 14:20:00");
            assertThat(schedules.get(0).getCreatedAt()).isEqualTo("2026-06-18 09:00:00");

            assertThat(logs).hasSize(1);
            assertThat(logs.get(0).getRequestIdsJson()).contains("request-001", "request-002");
            assertThat(logs.get(0).getStartedAt()).isEqualTo("2026-06-18 14:20:01");
            assertThat(logs.get(0).getFinishedAt()).isEqualTo("2026-06-18 14:20:05");
            assertThat(logs.get(0).getCreatedAt()).isEqualTo("2026-06-18 14:20:01");
            return null;
        });
    }

    /**
     * hub_job_outbox의 payload jsonb는 문자열로, next_retry_at, created_at, updated_at, locked_at은 OffsetDateTime으로 정상 매핑되는지 검증합니다.
     */
    @Test
    void jobOutboxMapperMapsJsonbPayloadAndTimestamptzColumnsToOffsetDateTime() {
        inRollbackTransaction(() -> {
            String requestId = insertOutbox();

            List<JobOutbox> claimed = jobOutboxMapper.claimPending(10, "mybatis-test-runner", 60);

            assertThat(claimed)
                    .extracting(JobOutbox::getRequestId)
                    .contains(requestId);

            JobOutbox outbox = claimed.stream()
                    .filter(row -> requestId.equals(row.getRequestId()))
                    .findFirst()
                    .orElseThrow();

            assertThat(outbox.getPayload()).contains("requestId", requestId);
            assertThat(outbox.getNextRetryAt()).isInstanceOf(OffsetDateTime.class);
            assertThat(outbox.getCreatedAt()).isInstanceOf(OffsetDateTime.class);
            assertThat(outbox.getUpdatedAt()).isInstanceOf(OffsetDateTime.class);
            assertThat(outbox.getLockedAt()).isInstanceOf(OffsetDateTime.class);
            assertThat(outbox.getLockedBy()).isEqualTo("mybatis-test-runner");
            return null;
        });
    }

    private DataSource dataSource() {
        return IntegrationTestDatabase.dataSource();
    }

    private <T> T mapper(DataSource dataSource, Class<T> mapperType, String mapperLocation) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(mapperLocation));

        SqlSessionFactory sqlSessionFactory = factoryBean.getObject();
        if (sqlSessionFactory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        sqlSessionFactory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!sqlSessionFactory.getConfiguration().hasMapper(mapperType)) {
            sqlSessionFactory.getConfiguration().addMapper(mapperType);
        }
        return new SqlSessionTemplate(sqlSessionFactory).getMapper(mapperType);
    }

    private <T> T inRollbackTransaction(Supplier<T> action) {
        return transactionTemplate.execute(status -> {
            try {
                return action.get();
            } finally {
                status.setRollbackOnly();
            }
        });
    }

    private long insertUser() {
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO users (username, password) VALUES (?, ?) RETURNING id",
                Long.class,
                userPrefix + "-" + shortId(),
                "integration-test-password"
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert test user");
        }
        return id;
    }

    private String insertExternalClient(long userId) {
        String clientId = clientPrefix + "-" + shortId();
        jdbcTemplate.update(
                """
                        INSERT INTO hub_external_api_client (
                            user_id,
                            client_name,
                            client_id,
                            client_secret_enc,
                            client_secret_fingerprint,
                            scopes,
                            status,
                            token_ttl_seconds,
                            signature_valid_seconds,
                            allowed_ips,
                            secret_rotated_at,
                            created_at,
                            updated_at
                        ) VALUES (
                            ?,
                            'MyBatis Mapping Client',
                            ?,
                            'enc-secret',
                            'fingerprint',
                            CAST(? AS jsonb),
                            'ACTIVE',
                            1800,
                            300,
                            CAST(? AS jsonb),
                            TIMESTAMPTZ '2026-06-18 10:20:30+09',
                            TIMESTAMPTZ '2026-06-18 10:20:30+09',
                            TIMESTAMPTZ '2026-06-18 10:20:30+09'
                        )
                        """,
                userId,
                clientId,
                "[\"orders:read\",\"orders:write\"]",
                "[\"127.0.0.1\"]"
        );
        return clientId;
    }

    private long insertSchedule(long userId) {
        Long id = jdbcTemplate.queryForObject(
                """
                        INSERT INTO hub_collect_schedule (
                            user_id,
                            schedule_name,
                            mall_keys,
                            date_range_type,
                            run_time,
                            enabled_yn,
                            running_yn,
                            next_run_at,
                            created_at,
                            updated_at
                        ) VALUES (
                            ?,
                            ?,
                            CAST(? AS jsonb),
                            'TODAY',
                            TIME '14:20:00',
                            'Y',
                            'N',
                            TIMESTAMPTZ '2026-06-18 14:20:00+09',
                            TIMESTAMPTZ '2026-06-18 09:00:00+09',
                            TIMESTAMPTZ '2026-06-18 09:00:00+09'
                        )
                        RETURNING id
                        """,
                Long.class,
                userId,
                schedulePrefix + "-" + shortId(),
                "[\"GODO\",\"NSS\"]"
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert schedule test row");
        }
        return id;
    }

    private void insertScheduleRunLog(long scheduleId, long userId) {
        jdbcTemplate.update(
                """
                        INSERT INTO hub_collect_schedule_run_log (
                            schedule_id,
                            user_id,
                            schedule_name,
                            status,
                            mall_keys,
                            date_range_type,
                            fr_dt,
                            to_dt,
                            job_count,
                            request_ids,
                            started_at,
                            finished_at,
                            created_at
                        ) VALUES (
                            ?,
                            ?,
                            ?,
                            'SUCCESS',
                            CAST(? AS jsonb),
                            'TODAY',
                            '20260618',
                            '20260618',
                            2,
                            CAST(? AS jsonb),
                            TIMESTAMPTZ '2026-06-18 14:20:01+09',
                            TIMESTAMPTZ '2026-06-18 14:20:05+09',
                            TIMESTAMPTZ '2026-06-18 14:20:01+09'
                        )
                        """,
                scheduleId,
                userId,
                schedulePrefix + "-runlog-" + shortId(),
                "[\"GODO\",\"NSS\"]",
                "[\"request-001\",\"request-002\"]"
        );
    }

    private String insertOutbox() {
        String requestId = requestPrefix + "-" + shortId();
        jdbcTemplate.update(
                """
                        INSERT INTO hub_job_outbox (
                            request_id,
                            event_type,
                            topic,
                            partition_key,
                            payload,
                            status,
                            retry_count,
                            max_retry_count,
                            next_retry_at,
                            created_at,
                            updated_at
                        ) VALUES (
                            ?,
                            'ORDER_COLLECT',
                            'hub.jobs',
                            'ORDER_COLLECT:1:GODO',
                            CAST(? AS jsonb),
                            'PENDING',
                            0,
                            3,
                            TIMESTAMPTZ '2026-06-18 10:20:30+09',
                            TIMESTAMPTZ '2026-06-18 10:20:30+09',
                            TIMESTAMPTZ '2026-06-18 10:20:30+09'
                        )
                        """,
                requestId,
                """
                        {"requestId":"%s","payload":{"channelCd":"GODO"}}
                        """.formatted(requestId)
        );
        return requestId;
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
