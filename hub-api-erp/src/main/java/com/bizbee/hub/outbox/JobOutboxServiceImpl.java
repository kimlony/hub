package com.bizbee.hub.outbox;

import com.bizbee.hub.job.HubJobEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class JobOutboxServiceImpl implements JobOutboxService {

    private final JobOutboxMapper jobOutboxMapper;
    private final ObjectMapper objectMapper;

    @Value("${hub.kafka.topics.jobs}")
    private String jobsTopic;

    @Override
    public void enqueue(HubJobEvent event) {
        JobOutbox outbox = JobOutbox.builder()
                .requestId(event.requestId())
                .eventType(event.jobType())
                .topic(jobsTopic)
                .partitionKey(buildPartitionKey(event))
                .payload(toJson(event))
                .status(JobOutboxStatus.PENDING)
                .retryCount(0)
                .maxRetryCount(5)
                .build();

        jobOutboxMapper.insert(outbox);
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
            throw new IllegalStateException("failed to serialize outbox event", exception);
        }
    }
}