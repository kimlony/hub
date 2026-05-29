package com.bizbee.hub.kafka;

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
