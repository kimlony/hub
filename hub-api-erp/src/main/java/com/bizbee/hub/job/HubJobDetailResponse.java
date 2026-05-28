package com.bizbee.hub.job;

import java.time.LocalDateTime;

public record HubJobDetailResponse(
        String requestId,
        String requestKey,
        String channelCd,
        String status,
        int retryCount,
        String errorMessage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
