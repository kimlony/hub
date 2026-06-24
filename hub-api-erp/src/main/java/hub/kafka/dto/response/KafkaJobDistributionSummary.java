package hub.kafka.dto.response;

import java.util.List;

public record KafkaJobDistributionSummary(
        Integer partition,
        Long jobCount,
        List<String> workerInstanceIds,
        List<String> kafkaClientIds,
        List<String> channels
) {
}
