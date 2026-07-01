package hub.job.event;

import java.util.Map;

public record HubJobEvent(
        String requestId,
        String sourceErp,
        String jobType,
        String requestKey,
        String parentJobId,
        String correlationId,
        String causationId,
        String schemaVersion,
        String payloadVersion,
        Map<String, Object> payload
) {
    public HubJobEvent(
            String requestId,
            String sourceErp,
            String jobType,
            String requestKey,
            Map<String, Object> payload
    ) {
        this(requestId, sourceErp, jobType, requestKey, null, requestId, null, "1.0", "1.0", payload);
    }
}
