package hub.job.dto.response;

public record HubJobListItem(
        String requestId,
        String jobType,
        String channelCd,
        String frDt,
        String toDt,
        String status,
        int retryCount,
        String errorMessage,
        String createdAt
) {
}
