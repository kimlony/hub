package hub.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.validation.ValidationAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtPropertiesValidationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ValidationAutoConfiguration.class))
            .withUserConfiguration(PropertiesConfiguration.class)
            .withPropertyValues(
                    "hub.jwt.ui.expiry-ms=86400000",
                    "hub.jwt.ui.issuer=easy-hub-ui",
                    "hub.jwt.ui.audience=easy-hub-web",
                    "hub.jwt.external.issuer=easy-hub-external",
                    "hub.jwt.external.audience=easy-hub-external-api"
            );

    @Test
    void weakUiSecretFailsConfigurationBinding() {
        contextRunner.withPropertyValues(
                        "hub.jwt.ui.secret=too-short",
                        "hub.jwt.external.secret=external-secret-that-is-at-least-32-bytes")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void missingExternalSecretFailsConfigurationBinding() {
        contextRunner.withPropertyValues("hub.jwt.ui.secret=ui-secret-that-is-at-least-32-bytes")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void equalUiAndExternalSecretsFailStartupGuard() {
        String shared = "shared-secret-that-is-at-least-32-bytes";
        UiJwtProperties ui = new UiJwtProperties();
        ui.setSecret(shared);
        ExternalJwtProperties external = new ExternalJwtProperties();
        external.setSecret(shared);

        var guard = new SecurityConfig(null, null).jwtSecretsMustBeDistinct(ui, external);

        assertThatThrownBy(guard::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be different");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({UiJwtProperties.class, ExternalJwtProperties.class})
    static class PropertiesConfiguration {
    }
}
