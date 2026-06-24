package hub.kafka.dto.response;

public record KafkaMonitorStats(
        Integer topicCount,
        Integer brokerCount,
        Integer partitionCount,
        Long totalLag
) {
}
