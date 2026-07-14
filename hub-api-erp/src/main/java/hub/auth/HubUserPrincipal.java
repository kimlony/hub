package hub.auth;

public record HubUserPrincipal(
        Long userId,
        Long corpId,
        String username,
        String role
) {
}
