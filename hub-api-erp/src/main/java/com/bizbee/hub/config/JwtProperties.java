package com.bizbee.hub.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter @Setter
@ConfigurationProperties(prefix = "hub.jwt")
public class JwtProperties {
    private String secret;
    private long   expiryMs;
}
