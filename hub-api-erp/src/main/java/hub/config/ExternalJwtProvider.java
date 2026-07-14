package hub.config;

import hub.external.ExternalApiPrincipal;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import javax.crypto.SecretKey;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ExternalJwtProvider {
    private final ExternalJwtProperties properties;

    public String generate(String clientId, Long userId, List<String> scopes, int expiresInSeconds) {
        if (clientId == null || clientId.isBlank() || userId == null || scopes == null) {
            throw new IllegalArgumentException("External token requires clientId, userId, and scopes");
        }
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(clientId)
                .issuer(properties.getIssuer())
                .claim("aud", properties.getAudience())
                .claim("type", JwtTokenType.EXTERNAL.name())
                .claim("clientId", clientId)
                .claim("userId", userId)
                .claim("scopes", scopes)
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiresInSeconds * 1000L))
                .signWith(key())
                .compact();
    }

    public Optional<ExternalApiPrincipal> authenticate(String token) {
        try {
            Claims claims = parse(token);
            if (!JwtTokenType.EXTERNAL.name().equals(JwtClaimSupport.requiredString(claims, "type"))
                    || !properties.getIssuer().equals(claims.getIssuer())
                    || !JwtClaimSupport.hasAudience(claims, properties.getAudience())
                    || !JwtClaimSupport.hasValidTimes(claims)) {
                return Optional.empty();
            }
            String clientId = JwtClaimSupport.requiredString(claims, "clientId");
            Long userId = JwtClaimSupport.requiredLong(claims, "userId");
            List<String> scopes = requiredStringList(claims.get("scopes"));
            if (clientId == null || !clientId.equals(claims.getSubject()) || userId == null || scopes == null) {
                return Optional.empty();
            }
            return Optional.of(new ExternalApiPrincipal(userId, clientId, scopes));
        } catch (Exception exception) {
            return Optional.empty();
        }
    }

    private Claims parse(String token) {
        return Jwts.parser().verifyWith(key()).build().parseSignedClaims(token).getPayload();
    }

    private SecretKey key() {
        return Keys.hmacShaKeyFor(properties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    private List<String> requiredStringList(Object value) {
        if (!(value instanceof List<?> list) || list.stream().anyMatch(item -> !(item instanceof String))) {
            return null;
        }
        return list.stream().map(String.class::cast).toList();
    }
}
