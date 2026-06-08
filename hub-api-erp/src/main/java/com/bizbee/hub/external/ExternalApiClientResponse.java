package com.bizbee.hub.external;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class ExternalApiClientResponse {
    private Long id;
    private String clientName;
    private String clientId;
    private List<String> scopes;
    private String status;
    private Integer tokenTtlSeconds;
    private Integer signatureValidSeconds;
    private List<String> allowedIps;
    private String lastCalledAt;
    private String secretRotatedAt;
    private String disabledAt;
    private String createdAt;
    private String updatedAt;
}
