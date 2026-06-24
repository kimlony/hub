package hub.external;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.config.AesEncryptor;
import hub.config.AesProperties;
import hub.config.JwtProperties;
import hub.config.JwtProvider;
import hub.external.dto.response.ExternalApiTokenResponse;
import hub.external.mapper.ExternalApiClientMapper;
import hub.external.service.ExternalApiAuthService;
import hub.external.service.ExternalApiAuthServiceImpl;
import hub.support.IntegrationTestDatabase;
import jakarta.servlet.FilterChain;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
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
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class ExternalApiAuthIntegrationTest {

    private static final String AES_SECRET = "test-only-aes-secret-32-bytes!!!";
    private static final String JWT_SECRET = "test-only-jwt-secret-32-bytes!!!";
    private static final String CLIENT_SECRET = "test-only-client-secret";

    private JdbcTemplate jdbcTemplate;
    private ExternalApiClientMapper externalApiClientMapper;
    private ExternalApiAuthServiceImpl externalApiAuthService;
    private ExternalApiAuthFilter externalApiAuthFilter;
    private AesEncryptor aesEncryptor;
    private TransactionTemplate transactionTemplate;
    private String userPrefix;
    private String clientPrefix;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        externalApiClientMapper = mapper(dataSource);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        aesEncryptor = new AesEncryptor(aesProperties());
        JwtProperties jwtProperties = jwtProperties();
        externalApiAuthService = new ExternalApiAuthServiceImpl(
                externalApiClientMapper,
                aesEncryptor,
                jwtProperties,
                new ObjectMapper()
        );
        externalApiAuthFilter = new ExternalApiAuthFilter(new JwtProvider(jwtProperties));
        userPrefix = "itusr-" + shortId();
        clientPrefix = "it-client-" + shortId();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
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
     * ?類ㅺ맒 clientId, timestamp, HMAC signature嚥??醫뤾쿃??獄쏆뮄???랁? 域??醫뤾쿃??곗쨮 /api/external/orders ?遺욧퍕 ??ExternalApiPrincipal????밴쉐??롫뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void issueTokenAndFilterCreatesExternalPrincipalForValidSignedClient() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String clientId = insertClient(userId, "ACTIVE", "[\"orders:read\"]", 1800, 300);
            String timestamp = timestampNow();
            String signature = hmacSha256Hex(CLIENT_SECRET, clientId + "." + timestamp);

            ExternalApiTokenResponse tokenResponse = externalApiAuthService.issueToken(clientId, timestamp, signature);

            assertThat(tokenResponse.getTokenType()).isEqualTo("Bearer");
            assertThat(tokenResponse.getAccessToken()).isNotBlank();
            assertThat(tokenResponse.getScopes()).containsExactly("orders:read");

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
            MockHttpServletResponse response = new MockHttpServletResponse();
            request.addHeader("Authorization", "Bearer " + tokenResponse.getAccessToken());
            AtomicBoolean chainCalled = new AtomicBoolean(false);
            FilterChain chain = (servletRequest, servletResponse) -> chainCalled.set(true);

            externalApiAuthFilter.doFilter(request, response, chain);

            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            assertThat(chainCalled).isTrue();
            assertThat(authentication).isNotNull();
            assertThat(authentication.getPrincipal()).isInstanceOf(ExternalApiPrincipal.class);

            ExternalApiPrincipal principal = (ExternalApiPrincipal) authentication.getPrincipal();
            assertThat(principal.userId()).isEqualTo(userId);
            assertThat(principal.clientId()).isEqualTo(clientId);
            assertThat(principal.hasScope("orders:read")).isTrue();
            return null;
        });
    }

    /**
     * DB?????貫留??酉???secret 疫꿸퀣???곗쨮 ??뺤구??筌띿쉸? ??놁몵筌??醫뤾쿃 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void issueTokenRejectsInvalidSignatureAgainstStoredEncryptedSecret() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String clientId = insertClient(userId, "ACTIVE", "[\"orders:read\"]", 1800, 300);

            assertThatThrownBy(() -> externalApiAuthService.issueToken(clientId, timestampNow(), "wrong-signature"))
                    .isInstanceOf(ExternalApiAuthException.class);
            return null;
        });
    }

    /**
     * DB???紐? API ?????곷섧???怨밴묶揶쎛 DISABLED??????而?몴???뺤구??癰귣?沅???醫뤾쿃 獄쏆뮄???椰꾧퀡???롫뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void issueTokenRejectsInactiveClientFromDatabase() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String clientId = insertClient(userId, "DISABLED", "[\"orders:read\"]", 1800, 300);
            String timestamp = timestampNow();
            String signature = hmacSha256Hex(CLIENT_SECRET, clientId + "." + timestamp);

            assertThatThrownBy(() -> externalApiAuthService.issueToken(clientId, timestamp, signature))
                    .isInstanceOf(ExternalApiAuthException.class);
            return null;
        });
    }

    /**
     * 筌띾슢利??EXTERNAL JWT???袁り숲揶쎛 principal??筌띾슢諭억쭪? ??낅뮉筌왖 野꺜筌앹빜鍮??덈뼄.
     */
    @Test
    void issuedTokenIsNotAcceptedByExternalFilterAfterExpiration() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String clientId = insertClient(userId, "ACTIVE", "[\"orders:read\"]", -1, 300);
            String timestamp = timestampNow();
            String signature = hmacSha256Hex(CLIENT_SECRET, clientId + "." + timestamp);
            String accessToken = externalApiAuthService.issueToken(clientId, timestamp, signature).getAccessToken();

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
            MockHttpServletResponse response = new MockHttpServletResponse();
            request.addHeader("Authorization", "Bearer " + accessToken);
            AtomicBoolean chainCalled = new AtomicBoolean(false);
            FilterChain chain = (servletRequest, servletResponse) -> chainCalled.set(true);

            externalApiAuthFilter.doFilter(request, response, chain);

            assertThat(chainCalled).isTrue();
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            return null;
        });
    }

    private DataSource dataSource() {
        return IntegrationTestDatabase.dataSource();
    }

    private ExternalApiClientMapper mapper(DataSource dataSource) throws Exception {
        SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
        factoryBean.setDataSource(dataSource);
        factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver()
                .getResources("classpath:mapper/ExternalApiClientMapper.xml"));

        SqlSessionFactory sqlSessionFactory = factoryBean.getObject();
        if (sqlSessionFactory == null) {
            throw new IllegalStateException("failed to create SqlSessionFactory");
        }
        sqlSessionFactory.getConfiguration().setMapUnderscoreToCamelCase(true);
        if (!sqlSessionFactory.getConfiguration().hasMapper(ExternalApiClientMapper.class)) {
            sqlSessionFactory.getConfiguration().addMapper(ExternalApiClientMapper.class);
        }
        return new SqlSessionTemplate(sqlSessionFactory).getMapper(ExternalApiClientMapper.class);
    }

    private <T> T inRollbackTransaction(ThrowingSupplier<T> action) {
        return transactionTemplate.execute(status -> {
            try {
                return action.get();
            } catch (RuntimeException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            } finally {
                SecurityContextHolder.clearContext();
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

    private String insertClient(
            long userId,
            String status,
            String scopesJson,
            int tokenTtlSeconds,
            int signatureValidSeconds
    ) {
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
                            allowed_ips
                        ) VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            CAST(? AS jsonb),
                            ?,
                            ?,
                            ?,
                            '[]'::jsonb
                        )
                        """,
                userId,
                "Integration Test Client",
                clientId,
                aesEncryptor.encrypt(CLIENT_SECRET),
                hmacSha256Hex("fingerprint", CLIENT_SECRET),
                scopesJson,
                status,
                tokenTtlSeconds,
                signatureValidSeconds
        );
        return clientId;
    }

    private AesProperties aesProperties() {
        AesProperties properties = new AesProperties();
        properties.setSecret(AES_SECRET);
        return properties;
    }

    private JwtProperties jwtProperties() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(JWT_SECRET);
        properties.setExpiryMs(86_400_000L);
        return properties;
    }

    private String timestampNow() {
        return OffsetDateTime.now(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private String hmacSha256Hex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private interface ThrowingSupplier<T> {
        T get() throws Exception;
    }
}
