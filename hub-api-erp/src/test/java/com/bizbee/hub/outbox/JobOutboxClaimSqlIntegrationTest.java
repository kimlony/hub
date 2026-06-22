package com.bizbee.hub.outbox;

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

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class JobOutboxClaimSqlIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private JobOutboxMapper jobOutboxMapper;
    private String requestPrefix;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        jobOutboxMapper = mapper(dataSource);
        requestPrefix = "it-outbox-" + UUID.randomUUID();
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update(
                "DELETE FROM hub_job_outbox WHERE request_id LIKE ?",
                requestPrefix + "%"
        );
    }

    /**
     * next_retry_at이 지난 PENDING 이벤트를 claim하면 PUBLISHING 상태와 locked_by가 갱신되는지 검증한다.
     */
    @Test
    void claimPendingClaimsDuePendingEventAndMarksPublishing() {
        long id = insertOutbox("PENDING", "NOW() - INTERVAL '1 minute'", null);

        List<JobOutbox> claimed = jobOutboxMapper.claimPending(10, "test-runner", 60);

        assertThat(claimed)
                .extracting(JobOutbox::getId)
                .contains(id);
        assertThat(statusOf(id)).isEqualTo("PUBLISHING");
        assertThat(lockedByOf(id)).isEqualTo("test-runner");
    }

    /**
     * next_retry_at이 미래인 PENDING 이벤트는 아직 재시도 시간이 아니므로 claim되지 않는지 검증한다.
     */
    @Test
    void claimPendingDoesNotClaimPendingEventBeforeNextRetryAt() {
        long id = insertOutbox("PENDING", "NOW() + INTERVAL '1 hour'", null);

        List<JobOutbox> claimed = jobOutboxMapper.claimPending(10, "test-runner", 60);

        assertThat(claimed)
                .extracting(JobOutbox::getId)
                .doesNotContain(id);
        assertThat(statusOf(id)).isEqualTo("PENDING");
    }

    /**
     * 오래된 PUBLISHING 이벤트는 stale로 판단해 다시 claim할 수 있는지 검증한다.
     */
    @Test
    void claimPendingReclaimsStalePublishingEvent() {
        long id = insertOutbox("PUBLISHING", "NOW() - INTERVAL '1 minute'", "NOW() - INTERVAL '2 minutes'");

        List<JobOutbox> claimed = jobOutboxMapper.claimPending(10, "test-runner", 60);

        assertThat(claimed)
                .extracting(JobOutbox::getId)
                .contains(id);
        assertThat(statusOf(id)).isEqualTo("PUBLISHING");
        assertThat(lockedByOf(id)).isEqualTo("test-runner");
    }

    /**
     * 방금 claim된 fresh PUBLISHING 이벤트는 stale이 아니므로 다시 claim되지 않는지 검증한다.
     */
    @Test
    void claimPendingDoesNotReclaimFreshPublishingEvent() {
        long id = insertOutbox("PUBLISHING", "NOW() - INTERVAL '1 minute'", "NOW()");

        List<JobOutbox> claimed = jobOutboxMapper.claimPending(10, "test-runner", 60);

        assertThat(claimed)
                .extracting(JobOutbox::getId)
                .doesNotContain(id);
        assertThat(statusOf(id)).isEqualTo("PUBLISHING");
    }

    /**
     * 한 번 claim되어 PUBLISHING이 된 이벤트는 다음 claim에서 중복으로 잡히지 않는지 검증한다.
     */
    @Test
    void claimPendingDoesNotClaimSameEventTwiceAfterItBecomesPublishing() {
        long firstId = insertOutbox("PENDING", "NOW() - INTERVAL '1 minute'", null);
        long secondId = insertOutbox("PENDING", "NOW() - INTERVAL '1 minute'", null);

        List<JobOutbox> firstClaim = jobOutboxMapper.claimPending(1, "first-runner", 60);
        List<JobOutbox> secondClaim = jobOutboxMapper.claimPending(10, "second-runner", 60);

        assertThat(firstClaim).hasSize(1);
        long firstClaimedId = firstClaim.get(0).getId();
        assertThat(List.of(firstId, secondId)).contains(firstClaimedId);
        assertThat(secondClaim)
                .extracting(JobOutbox::getId)
                .doesNotContain(firstClaimedId);
    }

    private DataSource dataSource() {
        return IntegrationTestDatabase.dataSource();
    }

    private JobOutboxMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/JobOutBoxMapper.xml"));

        SqlSessionFactory sqlSessionFactory = factoryBean.getObject();
        if (sqlSessionFactory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        if (!sqlSessionFactory.getConfiguration().hasMapper(JobOutboxMapper.class)) {
            sqlSessionFactory.getConfiguration().addMapper(JobOutboxMapper.class);
        }
        return new SqlSessionTemplate(sqlSessionFactory).getMapper(JobOutboxMapper.class);
    }

    private long insertOutbox(String status, String nextRetrySql, String lockedAtSql) {
        String requestId = requestPrefix + "-" + UUID.randomUUID();
        String lockedAtValue = lockedAtSql == null ? "NULL" : lockedAtSql;
        String sql = """
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
                    locked_by,
                    locked_at,
                    created_at,
                    updated_at
                ) VALUES (
                    ?,
                    'ORDER_COLLECT',
                    'hub.jobs',
                    ?,
                    CAST(? AS jsonb),
                    ?,
                    0,
                    5,
                    %s,
                    'previous-runner',
                    %s,
                    NOW(),
                    NOW()
                )
                RETURNING id
                """.formatted(nextRetrySql, lockedAtValue);

        Long id = jdbcTemplate.queryForObject(
                sql,
                Long.class,
                requestId,
                "ORDER_COLLECT:1:GODO",
                payload(requestId),
                status
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert outbox test row");
        }
        return id;
    }

    private String statusOf(long id) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM hub_job_outbox WHERE id = ?",
                String.class,
                id
        );
    }

    private String lockedByOf(long id) {
        return jdbcTemplate.queryForObject(
                "SELECT locked_by FROM hub_job_outbox WHERE id = ?",
                String.class,
                id
        );
    }

    private String payload(String requestId) {
        return """
                {
                  "requestId": "%s",
                  "sourceErp": "HUB",
                  "jobType": "ORDER_COLLECT",
                  "requestKey": "IT_ORDER_COLLECT",
                  "payload": {
                    "userId": 1,
                    "mallKey": "GODO",
                    "channelCd": "GODO"
                  }
                }
                """.formatted(requestId);
    }

}
