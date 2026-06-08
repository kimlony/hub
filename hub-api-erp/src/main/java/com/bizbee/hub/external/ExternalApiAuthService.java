package com.bizbee.hub.external;

public interface ExternalApiAuthService {
    ExternalApiTokenResponse issueToken(String clientId, String timestamp, String signature);
}
