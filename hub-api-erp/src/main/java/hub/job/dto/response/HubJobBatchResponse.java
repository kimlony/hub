package hub.job.dto.response;

import java.util.List;

public record HubJobBatchResponse(
        List<JobResult> jobs
) {
    public record JobResult(
            String requestId,
            String mallKey,
            String status
    ) {
    }
}
