package com.bizbee.hub.kafka;

public record KafkaBrokerInfo(
        Integer id,
        String host,
        Integer port,
        String rack,
        String status
) {
}
