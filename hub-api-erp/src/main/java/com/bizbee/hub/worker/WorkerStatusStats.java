package com.bizbee.hub.worker;

public record WorkerStatusStats(
        Integer totalCount,
        Long onlineCount,
        Long staleCount,
        Long stoppedCount
) {
}
