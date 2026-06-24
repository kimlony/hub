package hub.external.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ExternalApiClientCreateResponse {
    private ExternalApiClientResponse client;
    private String clientSecret;
    private String warning;
}
