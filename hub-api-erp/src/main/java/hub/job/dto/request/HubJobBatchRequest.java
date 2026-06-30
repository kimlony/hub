package hub.job.dto.request;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record HubJobBatchRequest(
        @NotBlank(message = "frDt is required")
        String frDt,

        @NotBlank(message = "toDt is required")
        String toDt,

        List<@NotBlank String> mallKeys,

        Integer mockPage,
        Integer mockSize,
        Integer mockTotalCount,
        String mockSeed,
        Integer mockDelayMs,
        Double mockErrorRate,
        Double mockTimeoutRate,
        String loadTestRunId,
        String scenario,
        List<Long> channelAccountIds
) {
    public HubJobBatchRequest(String frDt, String toDt, List<String> mallKeys) {
        this(frDt, toDt, mallKeys, null, null, null, null, null, null, null, null, null, null);
    }

    public HubJobBatchRequest(
            String frDt,
            String toDt,
            List<String> mallKeys,
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
        this(frDt, toDt, mallKeys, mockPage, mockSize, mockTotalCount, mockSeed,
                mockDelayMs, mockErrorRate, mockTimeoutRate, loadTestRunId, scenario, null);
    }
}
