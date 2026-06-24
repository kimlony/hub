package hub.job.event;

import java.util.Map;

public record HubJobEvent(
        String requestId,
        String sourceErp,
        String jobType,
        String requestKey,
        Map<String, Object> payload
) {
}
