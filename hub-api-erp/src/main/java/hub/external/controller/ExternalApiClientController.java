package hub.external.controller;

import hub.auth.HubUserPrincipal;
import hub.external.dto.request.ExternalApiClientCreateRequest;
import hub.external.dto.response.ExternalApiClientCreateResponse;
import hub.external.dto.response.ExternalApiClientResponse;
import hub.external.service.ExternalApiClientService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/external/clients")
@RequiredArgsConstructor
public class ExternalApiClientController {

    private final ExternalApiClientService externalApiClientService;

    @GetMapping
    public ResponseEntity<List<ExternalApiClientResponse>> getClients(@AuthenticationPrincipal HubUserPrincipal principal) {
        return ResponseEntity.ok(externalApiClientService.getClients(principal.username()));
    }

    @PostMapping
    public ResponseEntity<ExternalApiClientCreateResponse> createClient(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @Valid @RequestBody ExternalApiClientCreateRequest request
    ) {
        return ResponseEntity.ok(externalApiClientService.createClient(principal.username(), request));
    }
}
