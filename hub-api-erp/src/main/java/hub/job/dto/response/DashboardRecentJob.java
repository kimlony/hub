package hub.job.dto.response;

public record DashboardRecentJob(
        String requestId,
        String channelCd,
        String frDt,
        String toDt,
        String status,
        Integer retryCount,
        String errorMessage,
        String createdAt,
        String updatedAt
) {
}
