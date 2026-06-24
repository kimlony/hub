package hub.worker.dto.response;

public record WorkerStatusStats(
        Integer totalCount,
        Long onlineCount,
        Long staleCount,
        Long stoppedCount
) {
}
