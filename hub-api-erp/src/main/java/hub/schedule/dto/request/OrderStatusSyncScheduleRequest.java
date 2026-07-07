package hub.schedule.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import java.util.List;

public record OrderStatusSyncScheduleRequest(
        @NotBlank String scheduleName,
        List<@NotBlank String> mallKeys,
        List<Long> channelAccountIds,
        @NotEmpty List<@NotBlank String> statusTypes,
        String scheduleMode,
        Integer intervalHours,
        @NotBlank String dateRangeType,
        @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$") String runTime,
        String enabledYn
) {
}