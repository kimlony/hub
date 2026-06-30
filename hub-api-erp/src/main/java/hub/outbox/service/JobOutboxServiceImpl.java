package hub.outbox.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
import hub.outbox.domain.JobOutbox;
import hub.outbox.domain.JobOutboxStatus;
import hub.outbox.mapper.JobOutboxMapper;
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
        Object channelAccountId = event.payload().get("channelAccountId");
        Object channelCd = event.payload().get("channelCd");
        Object page = event.payload().get("page");

        if (channelAccountId == null) {
            return event.requestId();
        }

        if ("MOCK_MALL".equals(channelCd) && page != null) {
            return event.jobType() + ":" + channelAccountId + ":" + page;
        }

        return event.jobType() + ":" + channelAccountId;
    }

    private String toJson(HubJobEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to serialize outbox event", exception);
        }
    }
}
