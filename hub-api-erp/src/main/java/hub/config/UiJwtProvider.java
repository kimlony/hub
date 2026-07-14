package hub.config;

import hub.auth.HubUserPrincipal;
import hub.auth.domain.HubUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Optional;
import java.util.Set;
import javax.crypto.SecretKey;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UiJwtProvider {
    private static final Set<String> VALID_ROLES = Set.of("USER", "SYSTEM_ADMIN");

    private final UiJwtProperties properties;

    public String generate(HubUser user) {
        String role = normalizeRole(user.getRole());
        if (user.getId() == null || user.getCorpId() == null || user.getUsername() == null || role == null) {
            throw new IllegalArgumentException("UI token requires userId, corpId, username, and valid role");
        }
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(user.getUsername())
                .issuer(properties.getIssuer())
                .claim("aud", properties.getAudience())
                .claim("type", JwtTokenType.UI.name())
                .claim("userId", user.getId())
                .claim("corpId", user.getCorpId())
                .claim("role", role)
                .issuedAt(new Date(now))
                .expiration(new Date(now + properties.getExpiryMs()))
                .signWith(key())
                .compact();
    }

    public Optional<HubUserPrincipal> authenticate(String token) {
        try {
            Claims claims = parse(token);
            if (!JwtTokenType.UI.name().equals(JwtClaimSupport.requiredString(claims, "type"))
                    || !properties.getIssuer().equals(claims.getIssuer())
                    || !JwtClaimSupport.hasAudience(claims, properties.getAudience())
                    || !JwtClaimSupport.hasValidTimes(claims)) {
                return Optional.empty();
            }
            String username = claims.getSubject();
            Long userId = JwtClaimSupport.requiredLong(claims, "userId");
            Long corpId = JwtClaimSupport.requiredLong(claims, "corpId");
            String role = normalizeRole(JwtClaimSupport.requiredString(claims, "role"));
            if (username == null || username.isBlank() || userId == null || corpId == null || role == null) {
                return Optional.empty();
            }
            return Optional.of(new HubUserPrincipal(userId, corpId, username, role));
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

    private String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return null;
        }
        String normalized = role.trim().toUpperCase();
        return VALID_ROLES.contains(normalized) ? normalized : null;
    }
}
