package hub.schedule.dto.request;

import jakarta.validation.constraints.Pattern;

public record CollectScheduleEnabledRequest(
        @Pattern(regexp = "^[YN]$") String enabledYn
) {
}
