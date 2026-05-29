package com.bizbee.hub.kafka;

public record KafkaMonitorStats(
        Integer topicCount,
        Integer brokerCount,
        Integer partitionCount,
        Long totalLag
) {
}
