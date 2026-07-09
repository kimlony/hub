package hub.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtProvider {

    private static final String DEFAULT_ROLE = "USER";

    private final JwtProperties props;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generate(String username) {
        return generate(username, DEFAULT_ROLE);
    }

    public String generate(String username, String role) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(username)
                .claim("role", normalizeRole(role))
                .issuedAt(new Date(now))
                .expiration(new Date(now + props.getExpiryMs()))
                .signWith(key())
                .compact();
    }

    public String extractUsername(String token) {
        return claims(token).getSubject();
    }

    public String extractRole(String token) {
        return normalizeRole(claims(token).get("role", String.class));
    }

    public Claims extractClaims(String token) {
        return claims(token);
    }

    public boolean isValid(String token) {
        try {
            claims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return DEFAULT_ROLE;
        }
        return role.trim().toUpperCase();
    }

    private Claims claims(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}