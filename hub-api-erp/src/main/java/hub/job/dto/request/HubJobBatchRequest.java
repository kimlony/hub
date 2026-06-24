package hub.job.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record HubJobBatchRequest(
        @NotBlank(message = "frDt is required")
        String frDt,

        @NotBlank(message = "toDt is required")
        String toDt,

        @NotEmpty(message = "mallKeys must not be empty")
        List<@NotBlank String> mallKeys,

        Integer mockPage,
        Integer mockSize,
        Integer mockTotalCount,
        String mockSeed,
        Integer mockDelayMs,
        Double mockErrorRate,
        Double mockTimeoutRate,
        String loadTestRunId,
        String scenario
) {
    public HubJobBatchRequest(String frDt, String toDt, List<String> mallKeys) {
        this(frDt, toDt, mallKeys, null, null, null, null, null, null, null, null, null);
    }
}
