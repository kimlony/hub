package hub.erp;

import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.mapper.ErpApplyResultMapper;
import hub.support.IntegrationTestDatabase;
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

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class ErpApplyResultTenantIsolationIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private ErpApplyResultMapper mapper;
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = IntegrationTestDatabase.dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        mapper = mapper(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    @Test
    void scopesListCountDetailAndPipelineResultsByCorp() {
        inRollbackTransaction(() -> {
            TenantData one = insertTenant("ONE");
            TenantData two = insertTenant("TWO");
            String correlation = "it-shared-correlation-" + UUID.randomUUID().toString().substring(0, 8);
            long resultOne = insertResult(one.orderId(), "erp-one-" + shortId(), correlation, "MOCK-ONE");
            long resultTwo = insertResult(two.orderId(), "erp-two-" + shortId(), correlation, "MOCK-TWO");

            ErpApplyResultSearchCondition condition = new ErpApplyResultSearchCondition(
                    one.corpId(), null, null, null, null, correlation, null, null, null, 20, 0);

            assertThat(mapper.selectList(condition)).extracting(row -> row.getId())
                    .containsExactly(resultOne);
            assertThat(mapper.selectCount(condition)).isEqualTo(1);
            assertThat(mapper.selectByIdAndCorpId(resultTwo, one.corpId())).isNull();
            assertThat(mapper.selectByCorrelationIdAndCorpId(correlation, one.corpId()))
                    .extracting(row -> row.getId()).containsExactly(resultOne);
            return null;
        });
    }

    private ErpApplyResultMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/ErpApplyResultMapper.xml"));
        SqlSessionFactory factory = factoryBean.getObject();
        if (factory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        factory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!factory.getConfiguration().hasMapper(ErpApplyResultMapper.class)) {
            factory.getConfiguration().addMapper(ErpApplyResultMapper.class);
        }
        return new SqlSessionTemplate(factory).getMapper(ErpApplyResultMapper.class);
    }

    private TenantData insertTenant(String label) {
        String suffix = shortId();
        Long corpId = jdbcTemplate.queryForObject(
                "INSERT INTO hub_corp (corp_cd, corp_name) VALUES (?, ?) RETURNING id",
                Long.class, "IT-ERP-" + label + "-" + suffix, "ERP Tenant " + label + " " + suffix);
        Long userId = jdbcTemplate.queryForObject(
                "INSERT INTO users (corp_id, username, password) VALUES (?, ?, ?) RETURNING id",
                Long.class, corpId, "it-erp-user-" + label.toLowerCase() + "-" + suffix, "test-password");
        Long channelId = jdbcTemplate.queryForObject(
                "INSERT INTO user_malls (corp_id, user_id, mall_key, account_name) VALUES (?, ?, 'GODO', ?) RETURNING id",
                Long.class, corpId, userId, "ERP Integration " + label);
        Long orderId = jdbcTemplate.queryForObject("""
                INSERT INTO hub_collected_order (
                    corp_id, channel_account_id, user_id, channel_cd, mall_key, channel_order_id
                ) VALUES (?, ?, ?, 'GODO', 'GODO', ?) RETURNING id
                """, Long.class, corpId, channelId, userId, "ORDER-" + label + "-" + suffix);
        if (corpId == null || orderId == null) {
            throw new IllegalStateException("failed to create ERP integration tenant");
        }
        return new TenantData(corpId, orderId);
    }

    private long insertResult(long orderId, String requestId, String correlationId, String connectionId) {
        Long id = jdbcTemplate.queryForObject("""
                INSERT INTO hub_erp_apply_result (
                    request_id, correlation_id, normalized_order_id, erp_connection_id,
                    operation, status, idempotency_key, request_payload, response_payload
                ) VALUES (?, ?, ?, ?, 'CREATE', 'FAILED', ?, '{}'::jsonb, '{}'::jsonb)
                RETURNING id
                """, Long.class, requestId, correlationId, orderId, connectionId, "idem-" + requestId);
        if (id == null) {
            throw new IllegalStateException("failed to create ERP integration result");
        }
        return id;
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
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

    private record TenantData(long corpId, long orderId) {
    }
}
