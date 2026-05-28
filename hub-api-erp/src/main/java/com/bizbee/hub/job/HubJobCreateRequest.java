package com.bizbee.hub.job;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record HubJobCreateRequest(
        @NotBlank(message = "sourceErp is required")
        String sourceErp,

        @NotBlank(message = "jobType is required")
        String jobType,

        @NotBlank(message = "requestKey is required")
        String requestKey,

        @NotNull(message = "payload is required")
        Map<String, Object> payload
) {
}
