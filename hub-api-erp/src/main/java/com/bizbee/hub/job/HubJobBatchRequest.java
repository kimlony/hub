package com.bizbee.hub.job;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record HubJobBatchRequest(
        @NotBlank(message = "frDt is required")
        String frDt,

        @NotBlank(message = "toDt is required")
        String toDt,

        @NotEmpty(message = "mallKeys must not be empty")
        List<@NotBlank String> mallKeys
) {
}
