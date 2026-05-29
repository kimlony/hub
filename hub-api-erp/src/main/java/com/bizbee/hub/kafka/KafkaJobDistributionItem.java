package com.bizbee.hub.kafka;

public record KafkaJobDistributionItem(
        String requestId,
        String channelCd,
        Integer partition,
        String offset,
        String messageKey,
        String kafkaMessageId,
        String workerInstanceId,
        String kafkaClientId,
        String createdAt
) {
}
