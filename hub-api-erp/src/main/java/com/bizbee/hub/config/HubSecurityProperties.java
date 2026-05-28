package com.bizbee.hub.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hub.security")
public record HubSecurityProperties(
        boolean enabled,
        String headerName,
        String apiKey
) {
}
