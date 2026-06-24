package hub.worker.dto.response;

public record WorkerStatusItem(
        String workerId,
        String role,
        Integer pid,
        String hostname,
        String status,
        String startedAt,
        String lastSeenAt,
        Integer heartbeatIntervalSeconds,
        Long secondsSinceSeen,
        String metadata
) {
}
