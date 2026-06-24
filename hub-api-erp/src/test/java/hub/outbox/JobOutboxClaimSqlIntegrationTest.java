package hub.outbox;

import hub.outbox.domain.JobOutbox;
import hub.outbox.mapper.JobOutboxMapper;
import hub.support.IntegrationTestDatabase;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
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
     * next_retry_at??筌왖??PENDING ??源?紐? claim??롢늺 PUBLISHING ?怨밴묶?? locked_by揶쎛 揶쏄퉮???롫뮉筌왖 野꺜筌앹빜釉??
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
     * next_retry_at??沃섎챶???PENDING ??源?紐껊뮉 ?袁⑹춦 ???????볦퍢???袁⑤빍沃샕嚥?claim??? ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * ??살삋??PUBLISHING ??源?紐껊뮉 stale嚥??癒?뼊????쇰뻻 claim??????덈뮉筌왖 野꺜筌앹빜釉??
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
     * 獄쎻뫕??claim??fresh PUBLISHING ??源?紐껊뮉 stale???袁⑤빍沃샕嚥???쇰뻻 claim??? ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * ??甕?claim??뤿선 PUBLISHING??????源?紐껊뮉 ??쇱벉 claim?癒?퐣 餓λ쵎???곗쨮 ??レ뿳筌왖 ??낅뮉筌왖 野꺜筌앹빜釉??
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
