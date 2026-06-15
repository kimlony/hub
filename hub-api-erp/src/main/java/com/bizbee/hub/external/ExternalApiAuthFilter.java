package com.bizbee.hub.external;

import com.bizbee.hub.config.JwtProvider;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

@Component
@RequiredArgsConstructor
public class ExternalApiAuthFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        // Token issuing is public after HMAC verification. All other external
        // endpoints require a Bearer token created by ExternalApiAuthService.
        return !uri.startsWith("/api/external/") || uri.equals("/api/external/auth/token");
    }


    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (jwtProvider.isValid(token)) {
                Claims claims = jwtProvider.extractClaims(token);
                if ("EXTERNAL".equals(claims.get("type", String.class))) {
                    // Keep external clients isolated from normal UI users by
                    // exposing only userId, clientId, and scopes to controllers.
                    ExternalApiPrincipal principal = new ExternalApiPrincipal(
                            toLong(claims.get("userId")),
                            claims.get("clientId", String.class),
                            readScopes(claims.get("scopes"))
                    );
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(principal, null, Collections.emptyList());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
        }
        chain.doFilter(request, response);
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text);
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<String> readScopes(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .toList();
        }
        return List.of();
    }
}
