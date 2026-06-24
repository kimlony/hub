package hub.outbox.dto.response;

public record JobOutboxStats(
        Long total,
        Long pending,
        Long publishing,
        Long sent,
        Long failed,
        Long stale
) {
}
