package com.bizbee.hub.external;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/hub/external/clients")
@RequiredArgsConstructor
public class ExternalApiClientController {

    private final ExternalApiClientService externalApiClientService;

    @GetMapping
    public ResponseEntity<List<ExternalApiClientResponse>> getClients(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(externalApiClientService.getClients(username));
    }

    @PostMapping
    public ResponseEntity<ExternalApiClientCreateResponse> createClient(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody ExternalApiClientCreateRequest request
    ) {
        return ResponseEntity.ok(externalApiClientService.createClient(username, request));
    }
}
