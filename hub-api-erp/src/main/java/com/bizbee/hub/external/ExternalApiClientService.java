package com.bizbee.hub.external;

import java.util.List;

public interface ExternalApiClientService {
    List<ExternalApiClientResponse> getClients(String username);

    ExternalApiClientCreateResponse createClient(String username, ExternalApiClientCreateRequest request);
}
