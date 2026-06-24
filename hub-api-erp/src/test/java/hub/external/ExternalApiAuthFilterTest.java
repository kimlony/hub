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
     * ?紐? token 獄쏆뮄??endpoint??Bearer token 野꺜筌??袁り숲????筌왖 ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * ??곗뺘 Hub API endpoint??External API ?紐꾩쵄 ?袁り숲揶쎛 筌ｌ꼶???? ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * Authorization ??삳쐭揶쎛 ??곸몵筌?principal??筌띾슢諭억쭪? ??꾪???쇱벉 ?袁り숲嚥???띾┛?遺? 野꺜筌앹빜釉??
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
     * Bearer token???醫륁뒞??? ??놁몵筌?claims????? ??꾪?principal??筌띾슢諭억쭪? ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * JWT揶쎛 ?醫륁뒞??猷?type??EXTERNAL???袁⑤빍筌??紐? API principal??筌띾슢諭억쭪? ??낅뮉筌왖 野꺜筌앹빜釉??
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
     * ?醫륁뒞??EXTERNAL token????userId, clientId, scopes??揶쎛筌?ExternalApiPrincipal??SecurityContext?????館釉?遺? 野꺜筌앹빜釉??
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
