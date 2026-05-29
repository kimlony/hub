package com.bizbee.hub.kafka;

import java.util.List;

public record KafkaPartitionInfo(
        String topic,
        Integer partition,
        Integer leader,
        List<Integer> replicas,
        Long latestOffset,
        Long committedOffset,
        Long lag,
        String consumerId,
        String clientId,
        String host,
        String status
) {
}
