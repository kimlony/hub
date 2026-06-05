package com.bizbee.hub.kafka;

import java.time.LocalDateTime;
import java.util.List;

public record KafkaDlqMessageResponse(
        String topic,
        int total,
        List<KafkaDlqMessageItem> messages,
        String status,
        String errorMessage,
        LocalDateTime generatedAt
) {
}
