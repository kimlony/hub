package hub.job.dto.response;

public record HubJobLogItem(
        Long id,
        String requestId,
        String eventType,
        String level,
        String message,
        String channelCd,
        String mallKey,
        Integer retryCount,
        Integer maxRetryCount,
        String errorMessage,
        String detail,
        String createdAt
) {
}
