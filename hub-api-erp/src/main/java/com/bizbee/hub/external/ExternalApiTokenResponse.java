package com.bizbee.hub.external;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
public class ExternalApiTokenResponse {
    private String accessToken;
    private String tokenType;
    private int expiresIn;
    private List<String> scopes;
}
