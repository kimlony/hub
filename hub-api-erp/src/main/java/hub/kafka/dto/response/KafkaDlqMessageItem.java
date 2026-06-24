package hub.kafka.dto.response;

public record KafkaDlqMessageItem(
        String key,
        int partition,
        long offset,
        String createdAt,
        String failedAt,
        String source,
        String errorMessage,
        int retryCount,
        int maxRetryCount,
        String requestId,
        String jobType,
        String requestKey,
        String channelCd,
        String payload,
        String rawMessage
) {
}
