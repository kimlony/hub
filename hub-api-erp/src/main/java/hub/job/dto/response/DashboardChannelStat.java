package hub.job.dto.response;

public record DashboardChannelStat(
        String channelCd,
        Long totalCount,
        Long successCount,
        Long failedCount,
        Long processingCount,
        Long queuedCount
) {
}
