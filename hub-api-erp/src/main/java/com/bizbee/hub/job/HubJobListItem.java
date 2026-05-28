package com.bizbee.hub.job;

public record HubJobListItem(
        String requestId,
        String channelCd,
        String frDt,
        String toDt,
        String status,
        int retryCount,
        String errorMessage,
        String createdAt
) {
}
