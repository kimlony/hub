package hub.external;

import hub.config.JwtProvider;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExternalApiAuthFilterTest {

    @Mock
    private JwtProvider jwtProvider;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    /**
     * 토큰 발급 경로에서는 외부 API 인증 필터를 건너뛰는지 검증한다.
     */
    @Test
    void skipsTokenIssueEndpoint() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/external/auth/token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(jwtProvider, never()).isValid(anyString());
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 일반 HUB API 경로에서는 외부 API 인증 필터를 건너뛰는지 검증한다.
     */
    @Test
    void skipsNonExternalApiEndpoint() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/hub/jobs");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(jwtProvider, never()).isValid(anyString());
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * Authorization 헤더가 없으면 인증 주체를 만들지 않는지 검증한다.
     */
    @Test
    void doesNotCreatePrincipalWhenAuthorizationHeaderIsMissing() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(jwtProvider, never()).isValid(anyString());
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 유효하지 않은 토큰으로 인증 주체를 만들지 않는지 검증한다.
     */
    @Test
    void doesNotCreatePrincipalWhenTokenIsInvalid() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        request.addHeader("Authorization", "Bearer invalid-token");

        when(jwtProvider.isValid("invalid-token")).thenReturn(false);

        filter.doFilter(request, response, chain);

        verify(jwtProvider).isValid("invalid-token");
        verify(jwtProvider, never()).extractClaims("invalid-token");
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 외부 API용이 아닌 JWT로 인증 주체를 만들지 않는지 검증한다.
     */
    @Test
    void doesNotCreatePrincipalWhenJwtTypeIsNotExternal() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        Claims claims = mock(Claims.class);
        request.addHeader("Authorization", "Bearer normal-token");

        when(jwtProvider.isValid("normal-token")).thenReturn(true);
        when(jwtProvider.extractClaims("normal-token")).thenReturn(claims);
        when(claims.get("type", String.class)).thenReturn("USER");

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 유효한 외부 API 토큰으로 인증 주체를 생성하는지 검증한다.
     */
    @Test
    void createsExternalPrincipalWhenTokenIsValidExternalToken() throws Exception {
        ExternalApiAuthFilter filter = new ExternalApiAuthFilter(jwtProvider);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/external/orders");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        Claims claims = mock(Claims.class);
        request.addHeader("Authorization", "Bearer external-token");

        when(jwtProvider.isValid("external-token")).thenReturn(true);
        when(jwtProvider.extractClaims("external-token")).thenReturn(claims);
        when(claims.get("type", String.class)).thenReturn("EXTERNAL");
        when(claims.get("userId")).thenReturn(1L);
        when(claims.get("clientId", String.class)).thenReturn("client-001");
        when(claims.get("scopes")).thenReturn(List.of("orders:read"));

        filter.doFilter(request, response, chain);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isNotNull();
        assertThat(authentication.getPrincipal()).isInstanceOf(ExternalApiPrincipal.class);

        ExternalApiPrincipal principal = (ExternalApiPrincipal) authentication.getPrincipal();
        assertThat(principal.userId()).isEqualTo(1L);
        assertThat(principal.clientId()).isEqualTo("client-001");
        assertThat(principal.scopes()).containsExactly("orders:read");
        verify(chain).doFilter(request, response);
    }
}
