package hub.config;

import io.jsonwebtoken.Claims;
import java.util.Collection;
import java.util.Date;

final class JwtClaimSupport {
    private JwtClaimSupport() {
    }

    static boolean hasAudience(Claims claims, String expected) {
        Object audience = claims.get("aud");
        if (audience instanceof String value) {
            return expected.equals(value);
        }
        if (audience instanceof Collection<?> values) {
            return values.stream().anyMatch(expected::equals);
        }
        return false;
    }

    static Long requiredLong(Claims claims, String name) {
        Object value = claims.get(name);
        if (!(value instanceof Number number) || value instanceof Float || value instanceof Double) {
            return null;
        }
        long parsed = number.longValue();
        return parsed > 0 ? parsed : null;
    }

    static String requiredString(Claims claims, String name) {
        Object value = claims.get(name);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    static boolean hasValidTimes(Claims claims) {
        Date issuedAt = claims.getIssuedAt();
        Date expiration = claims.getExpiration();
        return issuedAt != null && expiration != null && expiration.after(issuedAt);
    }
}
