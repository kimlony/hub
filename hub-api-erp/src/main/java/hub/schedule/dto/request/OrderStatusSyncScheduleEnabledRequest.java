package hub.schedule.dto.request;

import jakarta.validation.constraints.Pattern;

public record OrderStatusSyncScheduleEnabledRequest(
        @Pattern(regexp = "^[YN]$") String enabledYn
) {
}
