package hub.kafka.dto.request;

public record KafkaDlqReplayRequest(
        String rawMessage
) {
}
