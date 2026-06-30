package hub.channel;

import hub.channel.domain.ChannelRow;
import hub.channel.mapper.ChannelMapper;
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
class ChannelMapperIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private ChannelMapper channelMapper;
    private TransactionTemplate transactionTemplate;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = IntegrationTestDatabase.dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        channelMapper = mapper(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    /**
     * 같은 회사가 동일 채널의 판매자 계정을 여러 개 저장할 수 있는지 검증한다.
     */
    @Test
    void sameCorpCanPersistMultipleAccountsForSameChannel() {
        inRollbackTransaction(() -> {
            Tenant tenant = insertTenant();
            ChannelRow first = account(tenant, "GODO main");
            ChannelRow second = account(tenant, "GODO outlet");

            channelMapper.insert(first);
            channelMapper.insert(second);

            assertThat(first.getId()).isNotNull();
            assertThat(second.getId()).isNotNull().isNotEqualTo(first.getId());
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM user_malls WHERE corp_id = ? AND mall_key = 'GODO'",
                    Integer.class,
                    tenant.corpId()
            );
            assertThat(count).isEqualTo(2);
            return null;
        });
    }

    /**
     * 채널 계정 삭제 시 행을 제거하지 않고 비활성화하는지 검증한다.
     */
    @Test
    void deleteSoftDeletesChannelAccount() {
        inRollbackTransaction(() -> {
            Tenant tenant = insertTenant();
            ChannelRow account = account(tenant, "GODO main");
            channelMapper.insert(account);

            channelMapper.delete(tenant.corpId(), account.getId());

            String useYn = jdbcTemplate.queryForObject(
                    "SELECT use_yn FROM user_malls WHERE id = ?",
                    String.class,
                    account.getId()
            );
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM user_malls WHERE id = ?",
                    Integer.class,
                    account.getId()
            );
            assertThat(useYn).isEqualTo("N");
            assertThat(count).isEqualTo(1);
            return null;
        });
    }

    private ChannelMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(
                new PathMatchingResourcePatternResolver().getResources("classpath:mapper/ChannelMapper.xml"));
        SqlSessionFactory sqlSessionFactory = factoryBean.getObject();
        if (sqlSessionFactory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        sqlSessionFactory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!sqlSessionFactory.getConfiguration().hasMapper(ChannelMapper.class)) {
            sqlSessionFactory.getConfiguration().addMapper(ChannelMapper.class);
        }
        return new SqlSessionTemplate(sqlSessionFactory).getMapper(ChannelMapper.class);
    }

    private Tenant insertTenant() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Long corpId = jdbcTemplate.queryForObject(
                "INSERT INTO hub_corp (corp_cd, corp_name) VALUES (?, ?) RETURNING id",
                Long.class,
                "IT-CHANNEL-" + suffix,
                "Channel Integration Corp " + suffix
        );
        Long userId = jdbcTemplate.queryForObject(
                "INSERT INTO users (corp_id, username, password) VALUES (?, ?, ?) RETURNING id",
                Long.class,
                corpId,
                "it-channel-user-" + suffix,
                "integration-test-password"
        );
        if (corpId == null || userId == null) {
            throw new IllegalStateException("failed to create channel integration tenant");
        }
        return new Tenant(corpId, userId);
    }

    private ChannelRow account(Tenant tenant, String accountName) {
        return ChannelRow.builder()
                .corpId(tenant.corpId())
                .userId(tenant.userId())
                .mallKey("GODO")
                .accountName(accountName)
                .useYn("Y")
                .build();
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

    private record Tenant(long corpId, long userId) {
    }
}
