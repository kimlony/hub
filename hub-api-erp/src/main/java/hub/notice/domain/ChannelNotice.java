package hub.notice.domain;

public record ChannelNotice(
        Long id,
        String channelCd,
        String severity,
        String status,
        String title,
        String message,
        String reason,
        Integer failureCount,
        String firstDetectedAt,
        String lastDetectedAt,
        String resolvedAt,
        String createdAt,
        String updatedAt
) {
}
