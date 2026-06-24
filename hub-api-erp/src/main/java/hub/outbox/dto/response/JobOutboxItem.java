package hub.outbox.dto.response;

public record JobOutboxItem(
        Long id,
        String requestId,
        String eventType,
        String topic,
        String partitionKey,
        String status,
        Integer retryCount,
        Integer maxRetryCount,
        String lastError,
        String createdAt,
        String updatedAt,
        String nextRetryAt,
        String lockedAt,
        String publishedAt
) {
}
