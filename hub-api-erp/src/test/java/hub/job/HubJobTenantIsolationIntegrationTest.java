package hub.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.mapper.UserMapper;
import hub.channel.mapper.ChannelMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.mapper.HubJobMapper;
import hub.job.service.HubJobServiceImpl;
import hub.job.service.JobPayloadValidator;
import hub.outbox.service.JobOutboxService;
import hub.support.IntegrationTestDatabase;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class HubJobTenantIsolationIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private HubJobMapper mapper;
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = IntegrationTestDatabase.dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        mapper = mapper(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    @Test
    void scopesListDetailDashboardPerformancePipelineLogsAndRetryUpdate() {
        inRollbackTransaction(() -> {
            long corpOne = insertCorp("ONE");
            long corpTwo = insertCorp("TWO");
            String suffix = UUID.randomUUID().toString().substring(0, 8);
            HubJob one = job("it-one-" + suffix, "it-key-one-" + suffix, "corr-one-" + suffix,
                    corpOne, HubJobStatus.SUCCESS, "GODO");
            HubJob two = job("it-two-" + suffix, "it-key-two-" + suffix, "corr-two-" + suffix,
                    corpTwo, HubJobStatus.FAILED, "ONRY");
            mapper.insertJob(one);
            mapper.insertJob(two);
            insertLog(one.getRequestId());
            insertLog(two.getRequestId());

            assertThat(mapper.selectJobListByCorpId(corpOne, null, null, 20, 0))
                    .extracting(HubJob::getRequestId).containsExactly(one.getRequestId());
            assertThat(mapper.selectJobListCountByCorpId(corpOne, null, null)).isEqualTo(1);
            assertThat(mapper.selectByRequestIdAndCorpId(two.getRequestId(), corpOne)).isNull();
            assertThat(mapper.selectPipelineByCorrelationIdAndCorpId(two.getCorrelationId(), corpOne)).isEmpty();

            assertThat(mapper.selectDashboardStatsByCorpId(corpOne).todayTotal()).isEqualTo(1);
            assertThat(mapper.selectDashboardRecentJobsByCorpId(corpOne, 8))
                    .extracting(item -> item.requestId()).containsExactly(one.getRequestId());
            assertThat(mapper.selectDashboardChannelStatsByCorpId(corpOne))
                    .extracting(item -> item.channelCd()).containsExactly("GODO");

            HubJobServiceImpl service = service();
            assertThat(service.getPerformance(corpOne, 60).summary().totalJobs()).isEqualTo(1);
            assertThat(service.getDashboard(corpOne).loadTestRuns()).isEmpty();

            assertThat(mapper.resetFailedJobForRetryByCorpId(two.getRequestKey(), two.getPayload(), corpOne))
                    .isZero();
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM hub_job WHERE request_id = ?", String.class, two.getRequestId()))
                    .isEqualTo("FAILED");

            assertThat(mapper.selectByRequestIdAndCorpId(one.getRequestId(), corpOne)).isNotNull();
            assertThat(mapper.selectJobLogs(one.getRequestId())).hasSize(1);
            return null;
        });
    }

    private HubJobServiceImpl service() {
        ObjectMapper objectMapper = new ObjectMapper();
        return new HubJobServiceImpl(
                mapper,
                mock(JobOutboxService.class),
                objectMapper,
                mock(UserMapper.class),
                mock(ChannelMapper.class),
                jdbcTemplate,
                new JobPayloadValidator(objectMapper)
        );
    }

    private HubJobMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/HubJobMapper.xml"));
        SqlSessionFactory factory = factoryBean.getObject();
        if (factory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        factory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!factory.getConfiguration().hasMapper(HubJobMapper.class)) {
            factory.getConfiguration().addMapper(HubJobMapper.class);
        }
        return new SqlSessionTemplate(factory).getMapper(HubJobMapper.class);
    }

    private long insertCorp(String label) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO hub_corp (corp_cd, corp_name) VALUES (?, ?) RETURNING id",
                Long.class, "IT-JOB-" + label + "-" + suffix, "Job Tenant " + label + " " + suffix);
        if (id == null) {
            throw new IllegalStateException("failed to create integration corp");
        }
        return id;
    }

    private HubJob job(String requestId, String requestKey, String correlationId,
                       long corpId, HubJobStatus status, String channel) {
        return HubJob.builder()
                .requestId(requestId)
                .requestKey(requestKey)
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .correlationId(correlationId)
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd(channel)
                .status(status)
                .payload("{\"corpId\":" + corpId + ",\"frDt\":\"20260714\",\"toDt\":\"20260714\"}")
                .retryCount(status == HubJobStatus.FAILED ? 1 : 0)
                .completedAt(LocalDateTime.now())
                .build();
    }

    private void insertLog(String requestId) {
        jdbcTemplate.update("""
                INSERT INTO hub_job_log (request_id, event_type, level, message, detail)
                VALUES (?, 'JOB_COMPLETED', 'INFO', 'integration test', '{}'::jsonb)
                """, requestId);
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
}
