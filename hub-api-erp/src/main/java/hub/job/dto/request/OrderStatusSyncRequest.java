package hub.job.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record OrderStatusSyncRequest(
        @NotBlank(message = "frDt is required")
        String frDt,

        @NotBlank(message = "toDt is required")
        String toDt,

        List<@NotBlank String> mallKeys,

        List<Long> channelAccountIds,

        @NotEmpty(message = "statusTypes must not be empty")
        List<@NotBlank String> statusTypes
) {
}
