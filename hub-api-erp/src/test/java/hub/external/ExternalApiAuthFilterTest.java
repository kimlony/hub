package hub.external;

import hub.config.ExternalJwtProvider;
import jakarta.servlet.FilterChain;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
    private ExternalJwtProvider externalJwtProvider;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void skipsTokenIssueEndpoint() throws Exception {
        var filter = new ExternalApiAuthFilter(externalJwtProvider);
        var request = new MockHttpServletRequest("POST", "/api/external/auth/token");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(externalJwtProvider, never()).authenticate(anyString());
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void skipsNonExternalApiEndpoint() throws Exception {
        var filter = new ExternalApiAuthFilter(externalJwtProvider);
        var request = new MockHttpServletRequest("GET", "/api/hub/jobs");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(externalJwtProvider, never()).authenticate(anyString());
        verify(chain).doFilter(request, response);
    }

    @Test
    void doesNotCreatePrincipalWhenTokenIsMissingOrInvalid() throws Exception {
        var filter = new ExternalApiAuthFilter(externalJwtProvider);
        var missingRequest = new MockHttpServletRequest("GET", "/api/external/orders");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(missingRequest, response, chain);
        verify(externalJwtProvider, never()).authenticate(anyString());

        var invalidRequest = new MockHttpServletRequest("GET", "/api/external/orders");
        invalidRequest.addHeader("Authorization", "Bearer invalid-token");
        when(externalJwtProvider.authenticate("invalid-token")).thenReturn(Optional.empty());
        filter.doFilter(invalidRequest, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(missingRequest, response);
        verify(chain).doFilter(invalidRequest, response);
    }

    @Test
    void createsExternalPrincipalOnlyAfterProviderValidation() throws Exception {
        var filter = new ExternalApiAuthFilter(externalJwtProvider);
        var request = new MockHttpServletRequest("GET", "/api/external/orders");
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        request.addHeader("Authorization", "Bearer external-token");
        var expected = new ExternalApiPrincipal(1L, "client-001", List.of("orders:read"));
        when(externalJwtProvider.authenticate("external-token")).thenReturn(Optional.of(expected));

        filter.doFilter(request, response, chain);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).isNotNull();
        assertThat(authentication.getPrincipal()).isEqualTo(expected);
        verify(chain).doFilter(request, response);
    }
}
