package com.bizbee.hub.kafka;

public record KafkaTopicInfo(
        String name,
        Integer partitions,
        Integer replicas,
        Long lag,
        String status
) {
}
