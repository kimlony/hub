package com.bizbee.hub.schedule;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;

import java.util.List;

public record CollectScheduleRequest(
        @NotBlank String scheduleName,
        @NotEmpty List<@NotBlank String> mallKeys,
        @NotBlank String dateRangeType,
        @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$") String runTime,
        String enabledYn
) {
}
