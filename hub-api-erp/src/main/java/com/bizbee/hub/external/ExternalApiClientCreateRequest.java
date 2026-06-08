package com.bizbee.hub.external;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class ExternalApiClientCreateRequest {

    @NotBlank
    @Size(max = 100)
    private String clientName;

    private List<String> scopes = new ArrayList<>(List.of("orders:read"));

    private List<String> allowedIps = new ArrayList<>();

    private Integer tokenTtlSeconds;

    private Integer signatureValidSeconds;
}
