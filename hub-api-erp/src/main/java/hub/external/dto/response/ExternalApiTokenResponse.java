package hub.external.dto.response;

import java.util.List;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ExternalApiTokenResponse {
    private String accessToken;
    private String tokenType;
    private int expiresIn;
    private List<String> scopes;
}
