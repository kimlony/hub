package hub.external.service;

import hub.external.dto.request.ExternalApiClientCreateRequest;
import hub.external.dto.response.ExternalApiClientCreateResponse;
import hub.external.dto.response.ExternalApiClientResponse;
import java.util.List;

public interface ExternalApiClientService {
    List<ExternalApiClientResponse> getClients(String username);

    ExternalApiClientCreateResponse createClient(String username, ExternalApiClientCreateRequest request);
}
