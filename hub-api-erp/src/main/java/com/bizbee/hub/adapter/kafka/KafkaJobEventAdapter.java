package com.bizbee.hub.adapter.kafka;

import com.bizbee.hub.job.HubJobEvent;
import com.bizbee.hub.port.JobEventPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaJobEventAdapter implements JobEventPort {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${hub.kafka.topics.jobs}")
    private String jobsTopic;

    @Override
    public void publish(HubJobEvent event) {
        String partitionKey = buildPartitionKey(event);
        kafkaTemplate.send(jobsTopic, partitionKey, toJson(event))
                .whenComplete((result, exception) -> {
                    if (exception != null) {
                        log.error(
                                "Failed to publish hub job event. requestId={}, partitionKey={}",
                                event.requestId(),
                                partitionKey,
                                exception
                        );
                        return;
                    }

                    log.debug(
                            "Published hub job event. requestId={}, partitionKey={}, topic={}, partition={}, offset={}",
                            event.requestId(),
                            partitionKey,
                            result.getRecordMetadata().topic(),
                            result.getRecordMetadata().partition(),
                            result.getRecordMetadata().offset()
                    );
                });
    }

    private String buildPartitionKey(HubJobEvent event) {
        Object userId = event.payload().get("userId");
        Object mallKey = event.payload().get("mallKey");

        if (userId == null || mallKey == null) {
            return event.requestId();
        }

        return event.jobType() + ":" + userId + ":" + mallKey;
    }

    private String toJson(HubJobEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to serialize hub job event", exception);
        }
    }
}
