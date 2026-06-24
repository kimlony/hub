package hub.external.controller;

import hub.external.dto.response.ExternalApiTokenResponse;
import hub.external.ExternalApiAuthException;
import hub.external.service.ExternalApiAuthService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/external/auth")
@RequiredArgsConstructor
public class ExternalApiAuthController {

    private final ExternalApiAuthService externalApiAuthService;

    @PostMapping("/token")
    public ResponseEntity<ExternalApiTokenResponse> issueToken(
            @RequestHeader("X-BizBee-Client-Id") String clientId,
            @RequestHeader("X-BizBee-Timestamp") String timestamp,
            @RequestHeader("X-BizBee-Signature") String signature
    ) {
        return ResponseEntity.ok(externalApiAuthService.issueToken(clientId, timestamp, signature));
    }

    @ExceptionHandler(ExternalApiAuthException.class)
    public ResponseEntity<Map<String, String>> handleAuthException(ExternalApiAuthException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "EXTERNAL_AUTH_FAILED", "message", e.getMessage()));
    }
}
