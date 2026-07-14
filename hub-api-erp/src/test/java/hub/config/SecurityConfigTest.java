package hub.config;

import hub.auth.domain.HubUser;
import hub.external.ExternalApiAuthFilter;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringJUnitWebConfig(SecurityConfigTest.TestWebConfig.class)
@TestPropertySource(properties = {
        "hub.jwt.ui.secret=ui-security-config-test-secret-at-least-32-bytes",
        "hub.jwt.ui.expiry-ms=86400000",
        "hub.jwt.ui.issuer=easy-hub-ui",
        "hub.jwt.ui.audience=easy-hub-web",
        "hub.jwt.external.secret=external-security-config-test-secret-at-least-32-bytes",
        "hub.jwt.external.issuer=easy-hub-external",
        "hub.jwt.external.audience=easy-hub-external-api"
})
class SecurityConfigTest {

    @Autowired
    private WebApplicationContext context;
    @Autowired
    private UiJwtProvider uiJwtProvider;
    @Autowired
    private ExternalJwtProvider externalJwtProvider;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void onlyLoginAndExternalTokenIssueArePublicApis() throws Exception {
        mockMvc.perform(post("/api/auth/login")).andExpect(status().isOk());
        mockMvc.perform(post("/api/external/auth/token")).andExpect(status().isOk());
        mockMvc.perform(get("/api/hub/test")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/orders/export/preview")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/orders/export/excel")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/orders/export/history")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/external/orders")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/unknown")).andExpect(status().isForbidden());
    }

    @Test
    void uiAndExternalTokensCannotCrossTrustDomains() throws Exception {
        String uiToken = uiToken("USER");
        String externalToken = externalJwtProvider.generate("client-001", 9L, List.of("orders:read"), 1800);

        mockMvc.perform(get("/api/hub/test").header("Authorization", "Bearer " + uiToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/hub/jobs/job-1/pipeline").header("Authorization", "Bearer " + uiToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/orders/export/preview").header("Authorization", "Bearer " + uiToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/external/orders").header("Authorization", "Bearer " + uiToken))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/external/orders").header("Authorization", "Bearer " + externalToken))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/hub/test").header("Authorization", "Bearer " + externalToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminRoutesRequireSystemAdminRole() throws Exception {
        mockMvc.perform(get("/api/admin/test").header("Authorization", "Bearer " + uiToken("USER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/test").header("Authorization", "Bearer " + uiToken("SYSTEM_ADMIN")))
                .andExpect(status().isOk());
    }

    private String uiToken(String role) {
        HubUser user = new HubUser();
        user.setId(1L);
        user.setCorpId(100L);
        user.setUsername("tester-" + role.toLowerCase());
        user.setRole(role);
        return uiJwtProvider.generate(user);
    }

    @Configuration
    @EnableWebMvc
    @Import(SecurityConfig.class)
    static class TestWebConfig {
        @Bean
        UiJwtProvider uiJwtProvider(UiJwtProperties properties) {
            return new UiJwtProvider(properties);
        }

        @Bean
        ExternalJwtProvider externalJwtProvider(ExternalJwtProperties properties) {
            return new ExternalJwtProvider(properties);
        }

        @Bean
        JwtAuthFilter jwtAuthFilter(UiJwtProvider provider) {
            return new JwtAuthFilter(provider);
        }

        @Bean
        ExternalApiAuthFilter externalApiAuthFilter(ExternalJwtProvider provider) {
            return new ExternalApiAuthFilter(provider);
        }

        @Bean
        TestController testController() {
            return new TestController();
        }
    }

    @RestController
    static class TestController {
        @PostMapping({"/api/auth/login", "/api/external/auth/token"})
        String publicEndpoint() {
            return "ok";
        }

        @GetMapping({
                "/api/hub/test",
                "/api/hub/jobs/job-1/pipeline",
                "/api/orders/export/preview",
                "/api/orders/export/history",
                "/api/external/orders",
                "/api/admin/test",
                "/api/unknown"
        })
        String protectedEndpoint() {
            return "ok";
        }

        @PostMapping("/api/orders/export/excel")
        String protectedPostEndpoint() {
            return "ok";
        }
    }
}
