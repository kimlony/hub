package hub.kafka.dto.response;

import hub.kafka.KafkaBrokerInfo;
import hub.kafka.KafkaTopicInfo;
import java.time.LocalDateTime;
import java.util.List;

public record KafkaMonitorResponse(
        KafkaMonitorStats stats,
        List<KafkaTopicInfo> topics,
        List<KafkaBrokerInfo> brokers,
        String consumerGroup,
        String status,
        String errorMessage,
        LocalDateTime generatedAt
) {
}
