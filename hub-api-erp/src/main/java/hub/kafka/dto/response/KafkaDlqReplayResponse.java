package hub.kafka.dto.response;

import java.time.LocalDateTime;

public record KafkaDlqReplayResponse(
        String requestId,
        String topic,
        String partitionKey,
        String status,
        LocalDateTime replayedAt
) {
}
