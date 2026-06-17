package com.bizbee.hub.outbox;

public record JobOutboxStats(
        Long total,
        Long pending,
        Long publishing,
        Long sent,
        Long failed,
        Long stale
) {
}
