package com.bizbee.hub.external;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExternalApiClientRow {
    private Long id;
    private Long userId;
    private String clientName;
    private String clientId;
    private String clientSecretEnc;
    private String clientSecretFingerprint;
    private String scopesJson;
    private String status;
    private Integer tokenTtlSeconds;
    private Integer signatureValidSeconds;
    private String allowedIpsJson;
    private String lastCalledAt;
    private String secretRotatedAt;
    private String disabledAt;
    private String createdAt;
    private String updatedAt;
}
