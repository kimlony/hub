package com.bizbee.hub.adapter.kafka;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic hubJobsTopic(
            @Value("${hub.kafka.topics.jobs}") String topicName,
            @Value("${hub.kafka.jobs-topic.partitions}") int partitions,
            @Value("${hub.kafka.jobs-topic.replicas}") int replicas
    ) {
        return TopicBuilder.name(topicName)
                .partitions(partitions)
                .replicas(replicas)
                .build();
    }
}
