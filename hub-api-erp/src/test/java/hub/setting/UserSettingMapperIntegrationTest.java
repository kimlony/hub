package hub.setting;

import hub.setting.mapper.UserSettingMapper;
import hub.support.IntegrationTestDatabase;
import java.util.UUID;
import javax.sql.DataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class UserSettingMapperIntegrationTest {
    private JdbcTemplate jdbcTemplate;
    private UserSettingMapper mapper;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = IntegrationTestDatabase.dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        mapper = mapper(dataSource);
    }

    @Test
    void createsFalseDefaultsAndUpsertsOneRowPerUser() {
        Long userId = insertUser();
        try {
            assertThat(mapper.insertDefaultIfAbsent(userId)).isEqualTo(1);
            assertThat(mapper.selectByUserId(userId).isAutoErpApply()).isFalse();
            assertThat(mapper.selectByUserId(userId).isAutoNewsCollect()).isFalse();

            mapper.upsert(userId, true, true);
            mapper.upsert(userId, false, true);

            assertThat(mapper.selectByUserId(userId).isAutoErpApply()).isFalse();
            assertThat(mapper.selectByUserId(userId).isAutoNewsCollect()).isTrue();
            assertThat(mapper.existsAutoNewsCollectEnabled()).isTrue();
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM hub_user_setting WHERE user_id = ?", Integer.class, userId))
                    .isEqualTo(1);
        } finally {
            jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
        }
    }

    private Long insertUser() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Long corpId = jdbcTemplate.queryForObject(
                "INSERT INTO hub_corp (corp_cd, corp_name) VALUES (?, ?) RETURNING id",
                Long.class, "IT-SETTING-" + suffix, "Setting Corp " + suffix);
        return jdbcTemplate.queryForObject(
                "INSERT INTO users (corp_id, username, password) VALUES (?, ?, 'pw') RETURNING id",
                Long.class, corpId, "setting-user-" + suffix);
    }

    private UserSettingMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/UserSettingMapper.xml"));
        SqlSessionFactory factory = factoryBean.getObject();
        if (factory == null) throw new IllegalStateException("failed to create SqlSessionFactory");
        factory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!factory.getConfiguration().hasMapper(UserSettingMapper.class)) {
            factory.getConfiguration().addMapper(UserSettingMapper.class);
        }
        return new SqlSessionTemplate(factory).getMapper(UserSettingMapper.class);
    }
}
