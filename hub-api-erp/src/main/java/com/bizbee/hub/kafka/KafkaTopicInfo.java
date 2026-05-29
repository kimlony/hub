package com.bizbee.hub.kafka;

import java.util.List;

public record KafkaTopicInfo(
        String name,
        Integer partitions,
        Integer replicas,
        Long lag,
        String status,
        List<KafkaPartitionInfo> partitionDetails
) {
}
