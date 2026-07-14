package hub.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "hub.jwt.external")
public class ExternalJwtProperties {
    @NotBlank
    @Size(min = 32)
    private String secret;
    @NotBlank
    private String issuer;
    @NotBlank
    private String audience;
}
