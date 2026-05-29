package com.bizbee.hub.worker;

import java.time.LocalDateTime;
import java.util.List;

public record WorkerStatusResponse(
        WorkerStatusStats stats,
        List<WorkerStatusItem> workers,
        LocalDateTime generatedAt
) {
}
