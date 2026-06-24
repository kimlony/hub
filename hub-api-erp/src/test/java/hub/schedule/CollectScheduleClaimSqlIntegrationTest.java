package hub.schedule;

import hub.schedule.domain.CollectScheduleRow;
import hub.schedule.mapper.CollectScheduleMapper;
import hub.support.IntegrationTestDatabase;
import java.util.function.Supplier;
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
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class CollectScheduleClaimSqlIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private CollectScheduleMapper collectScheduleMapper;
    private TransactionTemplate transactionTemplate;
    private String userPrefix;
    private String schedulePrefix;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        collectScheduleMapper = mapper(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        userPrefix = "itusr-" + shortId();
        schedulePrefix = "it-schedule-" + UUID.randomUUID();
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update(
                "DELETE FROM hub_collect_schedule_run_log WHERE schedule_name LIKE ?",
                schedulePrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM hub_collect_schedule WHERE schedule_name LIKE ?",
                schedulePrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM users WHERE username LIKE ?",
                userPrefix + "%"
        );
    }

    /**
     * ??쎈뻬 ??볦퍢??筌왖????뽮쉐 ???餓κ쑴? ?類ㅺ맒?怨몄몵嚥?claim??랁? DB??running_yn??Y嚥?獄쏅뗀???뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesClaimsDueEnabledScheduleAndMarksRunning() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(
                    userId,
                    "Y",
                    "N",
                    "TIMESTAMPTZ '2000-01-01 00:00:00+09'",
                    "NOW()"
            );

            List<CollectScheduleRow> claimed = collectScheduleMapper.claimDueSchedules(1);

            assertThat(claimed)
                    .extracting(CollectScheduleRow::getId)
                    .containsExactly(scheduleId);
            assertThat(claimed.get(0).getUsername()).startsWith(userPrefix);
            assertThat(runningYnOf(scheduleId)).isEqualTo("Y");
            return null;
        });
    }

    /**
     * ?袁⑹춦 ??쎈뻬 ??볦퍢????? ??? ???餓κ쑴? claim??? ??낅뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesDoesNotClaimFutureSchedule() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(
                    userId,
                    "Y",
                    "N",
                    "NOW() + INTERVAL '1 hour'",
                    "NOW()"
            );

            List<CollectScheduleRow> claimed = collectScheduleMapper.claimDueSchedules(1);

            assertThat(claimed)
                    .extracting(CollectScheduleRow::getId)
                    .doesNotContain(scheduleId);
            assertThat(runningYnOf(scheduleId)).isEqualTo("N");
            return null;
        });
    }

    /**
     * ????癒? ??쑵??源딆넅?????餓κ쑴? ??볦퍢??筌왖??롫즲 ??쎈뻬 ???怨몃퓠 ??釉??? ??낅뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesDoesNotClaimDisabledSchedule() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(
                    userId,
                    "N",
                    "N",
                    "TIMESTAMPTZ '2000-01-01 00:00:00+09'",
                    "NOW()"
            );

            List<CollectScheduleRow> claimed = collectScheduleMapper.claimDueSchedules(1);

            assertThat(claimed)
                    .extracting(CollectScheduleRow::getId)
                    .doesNotContain(scheduleId);
            assertThat(runningYnOf(scheduleId)).isEqualTo("N");
            return null;
        });
    }

    /**
     * ??? ??쎈뻬 餓λ쵐?졿?筌ㅼ뮄???揶쏄퉮??????餓κ쑴? 餓λ쵎????쎈뻬??? ??낅뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesDoesNotClaimFreshRunningSchedule() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(
                    userId,
                    "Y",
                    "Y",
                    "TIMESTAMPTZ '2000-01-01 00:00:00+09'",
                    "NOW()"
            );

            List<CollectScheduleRow> claimed = collectScheduleMapper.claimDueSchedules(1);

            assertThat(claimed)
                    .extracting(CollectScheduleRow::getId)
                    .doesNotContain(scheduleId);
            assertThat(runningYnOf(scheduleId)).isEqualTo("Y");
            return null;
        });
    }

    /**
     * running_yn='Y' ?怨밴묶嚥?筌롫뜆?э쭪?筌?30????곴맒 揶쏄퉮???? ??? ???餓κ쑴? ?關釉룡에?癰귣떯????쇰뻻 claim??????덈뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesReclaimsStaleRunningSchedule() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long scheduleId = insertSchedule(
                    userId,
                    "Y",
                    "Y",
                    "TIMESTAMPTZ '2000-01-01 00:00:00+09'",
                    "NOW() - INTERVAL '31 minutes'"
            );

            List<CollectScheduleRow> claimed = collectScheduleMapper.claimDueSchedules(1);

            assertThat(claimed)
                    .extracting(CollectScheduleRow::getId)
                    .containsExactly(scheduleId);
            assertThat(runningYnOf(scheduleId)).isEqualTo("Y");
            return null;
        });
    }

    /**
     * ??甕?claim?????餓κ쑴????쇰뻻 鈺곌퀬???? ??꾪? ??쇱벉 claim?癒?퐣???袁⑹춦 ??λ툡 ??덈뮉 ??삘뀲 ???餓κ쑬彛???レ뿳?遺? 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void claimDueSchedulesRespectsLimitAndDoesNotClaimSameScheduleTwice() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long firstScheduleId = insertSchedule(
                    userId,
                    "Y",
                    "N",
                    "TIMESTAMPTZ '2000-01-01 00:00:00+09'",
                    "NOW()"
            );
            long secondScheduleId = insertSchedule(
                    userId,
                    "Y",
                    "N",
                    "TIMESTAMPTZ '2000-01-01 00:01:00+09'",
                    "NOW()"
            );

            List<CollectScheduleRow> firstClaim = collectScheduleMapper.claimDueSchedules(1);
            List<CollectScheduleRow> secondClaim = collectScheduleMapper.claimDueSchedules(2);

            assertThat(firstClaim)
                    .extracting(CollectScheduleRow::getId)
                    .containsExactly(firstScheduleId);
            assertThat(secondClaim)
                    .extracting(CollectScheduleRow::getId)
                    .containsExactly(secondScheduleId);
            return null;
        });
    }

    private DataSource dataSource() {
        return IntegrationTestDatabase.dataSource();
    }

    private CollectScheduleMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/CollectScheduleMapper.xml"));

        SqlSessionFactory sqlSessionFactory = factoryBean.getObject();
        if (sqlSessionFactory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        if (!sqlSessionFactory.getConfiguration().hasMapper(CollectScheduleMapper.class)) {
            sqlSessionFactory.getConfiguration().addMapper(CollectScheduleMapper.class);
        }
        return new SqlSessionTemplate(sqlSessionFactory).getMapper(CollectScheduleMapper.class);
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

    private long insertSchedule(
            long userId,
            String enabledYn,
            String runningYn,
            String nextRunSql,
            String updatedAtSql
    ) {
        String scheduleName = schedulePrefix + "-" + UUID.randomUUID();
        String sql = """
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
                    ?,
                    ?,
                    %s,
                    NOW(),
                    %s
                )
                RETURNING id
                """.formatted(nextRunSql, updatedAtSql);

        Long id = jdbcTemplate.queryForObject(
                sql,
                Long.class,
                userId,
                scheduleName,
                "[\"GODO\"]",
                enabledYn,
                runningYn
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert schedule test row");
        }
        return id;
    }

    private String runningYnOf(long id) {
        return jdbcTemplate.queryForObject(
                "SELECT running_yn FROM hub_collect_schedule WHERE id = ?",
                String.class,
                id
        );
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
