package hub.config;

import hub.auth.domain.HubUser;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UiJwtProviderTest {
    private static final String UI_SECRET = "ui-test-secret-that-is-at-least-32-bytes-long";
    private static final String EXTERNAL_SECRET = "external-test-secret-at-least-32-bytes-long";

    private final UiJwtProvider provider = new UiJwtProvider(properties());

    @Test
    void generatesAndAuthenticatesStrictUiPrincipal() {
        HubUser user = new HubUser();
        user.setId(7L);
        user.setCorpId(101L);
        user.setUsername("operator");
        user.setRole("user");

        assertThat(provider.authenticate(provider.generate(user)))
                .contains(new hub.auth.HubUserPrincipal(7L, 101L, "operator", "USER"));
    }

    @Test
    void rejectsExternalSignatureAndExternalTokenType() {
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("EXTERNAL", 7L, 101L, "USER"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("UI", 7L, 101L, "USER"), true, true))).isEmpty();
    }

    @Test
    void rejectsMissingMalformedAndUntrustedClaims() {
        Map<String, Object> missingType = claims("UI", 7L, 101L, "USER");
        missingType.remove("type");
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                missingType, true, true))).isEmpty();

        Map<String, Object> missingUser = claims("UI", 7L, 101L, "USER");
        missingUser.remove("userId");
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                missingUser, true, true))).isEmpty();

        Map<String, Object> missingCorp = claims("UI", 7L, 101L, "USER");
        missingCorp.remove("corpId");
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                missingCorp, true, true))).isEmpty();

        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "wrong-issuer", "easy-hub-web",
                claims("UI", 7L, 101L, "USER"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "wrong-audience",
                claims("UI", 7L, 101L, "USER"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("UI", 7.5d, 101L, "USER"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("UI", 7L, 101L, "CORP_ADMIN"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, null, "easy-hub-ui", "easy-hub-web",
                claims("UI", 7L, 101L, "USER"), true, true))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("UI", 7L, 101L, "USER"), true, false))).isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "operator", "easy-hub-ui", "easy-hub-web",
                claims("UI", 7L, 101L, "USER"), false, true))).isEmpty();
        assertThat(provider.authenticate(expiredToken())).isEmpty();
    }

    private UiJwtProperties properties() {
        UiJwtProperties properties = new UiJwtProperties();
        properties.setSecret(UI_SECRET);
        properties.setExpiryMs(86_400_000L);
        properties.setIssuer("easy-hub-ui");
        properties.setAudience("easy-hub-web");
        return properties;
    }

    private Map<String, Object> claims(String type, Object userId, Object corpId, String role) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("type", type);
        claims.put("userId", userId);
        claims.put("corpId", corpId);
        claims.put("role", role);
        return claims;
    }

    private String sign(String secret, String subject, String issuer, String audience,
                        Map<String, Object> claims, boolean issuedAt, boolean expiration) {
        long now = System.currentTimeMillis();
        JwtBuilder builder = Jwts.builder().issuer(issuer).claim("aud", audience);
        if (subject != null) {
            builder.subject(subject);
        }
        claims.forEach(builder::claim);
        if (issuedAt) {
            builder.issuedAt(new Date(now));
        }
        if (expiration) {
            builder.expiration(new Date(now + 60_000));
        }
        return builder.signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8))).compact();
    }

    private String expiredToken() {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject("operator")
                .issuer("easy-hub-ui")
                .claim("aud", "easy-hub-web")
                .claim("type", "UI")
                .claim("userId", 7L)
                .claim("corpId", 101L)
                .claim("role", "USER")
                .issuedAt(new Date(now - 120_000))
                .expiration(new Date(now - 60_000))
                .signWith(Keys.hmacShaKeyFor(UI_SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }
}
