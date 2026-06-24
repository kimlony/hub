package hub.external;

import java.util.List;

public record ExternalApiPrincipal(
        Long userId,
        String clientId,
        List<String> scopes
) {
    public boolean hasScope(String scope) {
        return scopes != null && scopes.contains(scope);
    }
}
