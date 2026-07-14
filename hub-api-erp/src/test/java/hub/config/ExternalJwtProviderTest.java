package hub.config;

import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ExternalJwtProviderTest {
    private static final String EXTERNAL_SECRET = "external-test-secret-at-least-32-bytes-long";
    private static final String UI_SECRET = "ui-test-secret-that-is-at-least-32-bytes-long";

    private final ExternalJwtProvider provider = new ExternalJwtProvider(properties());

    @Test
    void generatesAndAuthenticatesStrictExternalPrincipal() {
        String token = provider.generate("client-001", 9L, List.of("orders:read"), 1800);

        assertThat(provider.authenticate(token)).hasValueSatisfying(principal -> {
            assertThat(principal.clientId()).isEqualTo("client-001");
            assertThat(principal.userId()).isEqualTo(9L);
            assertThat(principal.scopes()).containsExactly("orders:read");
        });
    }

    @Test
    void rejectsUiSignatureAndUiTokenType() {
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", claims("UI", 9L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(UI_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", claims("EXTERNAL", 9L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
    }

    @Test
    void rejectsMissingMalformedAndUntrustedClaims() {
        Map<String, Object> missingScopes = claims("EXTERNAL", 9L, "client-001", List.of("orders:read"));
        missingScopes.remove("scopes");
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", missingScopes, true, true))).isEmpty();

        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "wrong-issuer",
                "easy-hub-external-api", claims("EXTERNAL", 9L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "wrong-audience", claims("EXTERNAL", 9L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "different-client", "easy-hub-external",
                "easy-hub-external-api", claims("EXTERNAL", 9L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", claims("EXTERNAL", 0L, "client-001", List.of("orders:read")), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", claims("EXTERNAL", 9L, "client-001", List.of(1)), true, true)))
                .isEmpty();
        assertThat(provider.authenticate(sign(EXTERNAL_SECRET, "client-001", "easy-hub-external",
                "easy-hub-external-api", claims("EXTERNAL", 9L, "client-001", List.of("orders:read")), true, false)))
                .isEmpty();
        assertThat(provider.authenticate(provider.generate("client-001", 9L, List.of("orders:read"), -1)))
                .isEmpty();
    }

    private ExternalJwtProperties properties() {
        ExternalJwtProperties properties = new ExternalJwtProperties();
        properties.setSecret(EXTERNAL_SECRET);
        properties.setIssuer("easy-hub-external");
        properties.setAudience("easy-hub-external-api");
        return properties;
    }

    private Map<String, Object> claims(String type, Object userId, Object clientId, Object scopes) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("type", type);
        claims.put("userId", userId);
        claims.put("clientId", clientId);
        claims.put("scopes", scopes);
        return claims;
    }

    private String sign(String secret, String subject, String issuer, String audience,
                        Map<String, Object> claims, boolean issuedAt, boolean expiration) {
        long now = System.currentTimeMillis();
        JwtBuilder builder = Jwts.builder().subject(subject).issuer(issuer).claim("aud", audience);
        claims.forEach(builder::claim);
        if (issuedAt) {
            builder.issuedAt(new Date(now));
        }
        if (expiration) {
            builder.expiration(new Date(now + 60_000));
        }
        return builder.signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8))).compact();
    }
}
