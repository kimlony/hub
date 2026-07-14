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
@ConfigurationProperties(prefix = "hub.jwt.ui")
public class UiJwtProperties {
    @NotBlank
    @Size(min = 32)
    private String secret;
    private long expiryMs;
    @NotBlank
    private String issuer;
    @NotBlank
    private String audience;
}
