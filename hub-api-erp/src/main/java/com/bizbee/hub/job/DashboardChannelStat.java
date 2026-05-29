package com.bizbee.hub.job;

public record DashboardChannelStat(
        String channelCd,
        Long totalCount,
        Long successCount,
        Long failedCount,
        Long processingCount,
        Long queuedCount
) {
}
