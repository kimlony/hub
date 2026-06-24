package hub.external.service;

import hub.external.dto.response.ExternalApiTokenResponse;

public interface ExternalApiAuthService {
    ExternalApiTokenResponse issueToken(String clientId, String timestamp, String signature);
}
