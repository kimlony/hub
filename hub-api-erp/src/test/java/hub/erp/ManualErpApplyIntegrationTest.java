package hub.erp;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.mapper.UserMapper;
import hub.erp.dto.request.ManualErpApplyRequest;
import hub.erp.dto.response.ManualErpApplyCandidateResponse;
import hub.erp.dto.response.ManualErpApplyResponse;
import hub.erp.service.ManualErpApplyServiceImpl;
import hub.job.key.JobResourceKeyResolver;
import hub.job.mapper.HubJobMapper;
import hub.outbox.mapper.JobOutboxMapper;
import hub.outbox.service.JobOutboxService;
import hub.outbox.service.JobOutboxServiceImpl;
import hub.support.IntegrationTestDatabase;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.Mockito;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class ManualErpApplyIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private TransactionTemplate transactionTemplate;
    private HubJobMapper hubJobMapper;
    private UserMapper userMapper;
    private JobOutboxService realOutboxService;
    private ObjectMapper objectMapper;
    private String prefix;
    private long corpId;
    private long userId;
    private long channelAccountId;
    private String username;
    private String normalizeRequestId;
    private long normalizedOrderId;
    private String erpConnectionId;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = IntegrationTestDatabase.dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        SqlSessionTemplate session = sqlSessionTemplate(dataSource);
        hubJobMapper = session.getMapper(HubJobMapper.class);
        userMapper = session.getMapper(UserMapper.class);
        JobOutboxMapper outboxMapper = session.getMapper(JobOutboxMapper.class);
        objectMapper = new ObjectMapper();
        JobOutboxServiceImpl outboxService = new JobOutboxServiceImpl(
                outboxMapper, objectMapper, new JobResourceKeyResolver());
        ReflectionTestUtils.setField(outboxService, "jobsTopic", "hub.jobs");
        realOutboxService = outboxService;
        prefix = "it-manual-erp-" + UUID.randomUUID().toString().substring(0, 8);
        seed();
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update("DELETE FROM hub_erp_apply_command WHERE corp_id = ?", corpId);
        jdbcTemplate.update("DELETE FROM hub_job_outbox WHERE request_id IN (SELECT request_id FROM hub_job WHERE correlation_id = ?)", prefix);
        jdbcTemplate.update("DELETE FROM hub_erp_apply_result WHERE normalized_order_id IN (SELECT id FROM hub_collected_order WHERE corp_id = ?)", corpId);
        jdbcTemplate.update("DELETE FROM hub_collected_order WHERE corp_id = ?", corpId);
        jdbcTemplate.update("DELETE FROM hub_job WHERE correlation_id = ?", prefix);
        jdbcTemplate.update("DELETE FROM hub_erp_connection WHERE corp_id = ?", corpId);
        jdbcTemplate.update("DELETE FROM user_malls WHERE corp_id = ?", corpId);
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
        jdbcTemplate.update("DELETE FROM hub_corp WHERE id = ?", corpId);
    }

    @Test
    void createsManualErpJobAndOutboxAndReturnsSameCommandForDuplicateClientRequest() {
        ManualErpApplyServiceImpl service = service(realOutboxService);
        ManualErpApplyRequest request = new ManualErpApplyRequest(
                prefix + "-client", erpConnectionId, List.of(normalizedOrderId), "CREATE", "manual verification");

        ManualErpApplyResponse first = transactionTemplate.execute(status -> service.requestApply(username, request));
        ManualErpApplyResponse second = transactionTemplate.execute(status -> service.requestApply(username, request));

        assertThat(first).isNotNull();
        assertThat(second).isNotNull();
        assertThat(first.commandId()).isEqualTo(second.commandId());
        assertThat(first.accepted()).isEqualTo(1);
        assertThat(first.skipped()).isZero();
        assertThat(first.jobs()).hasSize(1);
        assertThat(second.jobs()).hasSize(1);

        String requestId = first.jobs().get(0).requestId();
        assertThat(jdbcTemplate.queryForMap("""
                SELECT job_type, status, parent_job_id, correlation_id, causation_id,
                       schema_version, payload_version, payload ->> 'triggerType' AS trigger_type
                FROM hub_job WHERE request_id = ?
                """, requestId))
                .containsEntry("job_type", "ERP_APPLY")
                .containsEntry("status", "QUEUED")
                .containsEntry("parent_job_id", normalizeRequestId)
                .containsEntry("correlation_id", prefix)
                .containsEntry("causation_id", first.commandId())
                .containsEntry("schema_version", "1.0")
                .containsEntry("payload_version", "1.0")
                .containsEntry("trigger_type", "MANUAL");
        assertThat(jdbcTemplate.queryForMap("""
                SELECT event_type, status, partition_key
                FROM hub_job_outbox WHERE request_id = ?
                """, requestId))
                .containsEntry("event_type", "ERP_APPLY")
                .containsEntry("status", "PENDING")
                .containsEntry("partition_key", "erp-connection:" + corpId + ":" + erpConnectionId);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hub_job WHERE causation_id = ?", Long.class, first.commandId())).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hub_job_outbox WHERE request_id = ?", Long.class, requestId)).isEqualTo(1L);
    }

    @Test
    void listsNormalizedOrderAsManualErpCandidate() {
        ManualErpApplyCandidateResponse response = service(realOutboxService)
                .getCandidates(username, erpConnectionId, "GODO", "NOT_APPLIED", 1, 30);

        assertThat(response.totalCount()).isEqualTo(1);
        assertThat(response.candidates()).singleElement().satisfies(candidate -> {
            assertThat(candidate.normalizedOrderId()).isEqualTo(normalizedOrderId);
            assertThat(candidate.sourceNormalizeJobId()).isEqualTo(normalizeRequestId);
            assertThat(candidate.erpStatus()).isEqualTo("NOT_APPLIED");
        });
    }

    @Test
    void rollsBackCommandAndJobWhenOutboxCreationFails() {
        JobOutboxService failingOutbox = Mockito.mock(JobOutboxService.class);
        Mockito.doThrow(new IllegalStateException("outbox failure"))
                .when(failingOutbox).enqueue(Mockito.any());
        ManualErpApplyServiceImpl service = service(failingOutbox);
        ManualErpApplyRequest request = new ManualErpApplyRequest(
                prefix + "-rollback", erpConnectionId, List.of(normalizedOrderId), "CREATE", null);

        assertThatThrownBy(() -> transactionTemplate.execute(status -> service.requestApply(username, request)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("outbox failure");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hub_erp_apply_command WHERE client_request_id = ?",
                Long.class, prefix + "-rollback")).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM hub_job WHERE causation_id LIKE ?",
                Long.class, prefix + "%")).isZero();
    }

    private ManualErpApplyServiceImpl service(JobOutboxService outboxService) {
        return new ManualErpApplyServiceImpl(
                jdbcTemplate, userMapper, hubJobMapper, outboxService, objectMapper);
    }

    private void seed() {
        corpId = jdbcTemplate.queryForObject("""
                INSERT INTO hub_corp (corp_cd, corp_name) VALUES (?, ?) RETURNING id
                """, Long.class, prefix, prefix);
        username = prefix + "-user";
        userId = jdbcTemplate.queryForObject("""
                INSERT INTO users (corp_id, username, password) VALUES (?, ?, ?) RETURNING id
                """, Long.class, corpId, username, "{noop}password");
        channelAccountId = jdbcTemplate.queryForObject("""
                INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
                VALUES (?, ?, 'GODO', 'Integration Account', 'Y') RETURNING id
                """, Long.class, corpId, userId);
        normalizeRequestId = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                INSERT INTO hub_job (
                    request_id, request_key, channel_cd, status, payload, retry_count,
                    job_type, source_erp, parent_job_id, correlation_id, causation_id,
                    schema_version, payload_version, created_at, updated_at
                ) VALUES (?, ?, 'GODO', 'SUCCESS', CAST(? AS jsonb), 0,
                          'ORDER_NORMALIZE', 'HUB', ?, ?, ?, '1.0', '1.0', NOW(), NOW())
                """, normalizeRequestId, "NORMALIZE_" + prefix,
                "{\"sourceRequestId\":\"collect-source\",\"channelCd\":\"GODO\"}",
                "collect-source", prefix, "collect-source");
        normalizedOrderId = jdbcTemplate.queryForObject("""
                INSERT INTO hub_collected_order (
                    corp_id, channel_account_id, user_id, request_id, request_key,
                    source_erp, channel_cd, mall_key, channel_order_id, order_status,
                    order_date, raw_payload, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'HUB', 'GODO', 'GODO', ?, 'PAID', NOW(), '{}'::jsonb, NOW(), NOW())
                RETURNING id
                """, Long.class, corpId, channelAccountId, userId, normalizeRequestId,
                "NORMALIZE_" + prefix, prefix + "-order");
        erpConnectionId = prefix + "-erp";
        jdbcTemplate.update("""
                INSERT INTO hub_erp_connection (
                    corp_id, erp_connection_id, erp_type, auth_type, is_active, created_at, updated_at
                ) VALUES (?, ?, 'MOCK', 'NONE', TRUE, NOW(), NOW())
                """, corpId, erpConnectionId);
    }

    private SqlSessionTemplate sqlSessionTemplate(DataSource dataSource) throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = {
                resolver.getResource("classpath:mapper/HubJobMapper.xml"),
                resolver.getResource("classpath:mapper/JobOutBoxMapper.xml"),
                resolver.getResource("classpath:mapper/UserMapper.xml")
        };
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);

        org.apache.ibatis.session.Configuration configuration = new org.apache.ibatis.session.Configuration();
        configuration.setMapUnderscoreToCamelCase(true);
        factoryBean.setConfiguration(configuration);

        factoryBean.setMapperLocations(resources);
        SqlSessionFactory factory = factoryBean.getObject();
        if (factory == null) throw new IllegalStateException("failed to create SqlSessionFactory");
        return new SqlSessionTemplate(factory);
    }
}