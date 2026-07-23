package hub.outbox.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
import hub.job.key.JobResourceKeyResolver;
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
    private final JobResourceKeyResolver jobResourceKeyResolver;

    @Value("${hub.kafka.topics.jobs}")
    private String jobsTopic;

    @Override
    public void enqueue(HubJobEvent event) {
        enqueue(event, jobResourceKeyResolver.resolvePartitionKey(event));
    }

    @Override
    public void enqueue(HubJobEvent event, String partitionKey) {
        // 호출한 서비스의 트랜잭션에서 Job 상태와 이 row를 함께 저장한다.
        // Kafka I/O는 commit 이후 JobOutboxPublisher가 수행하도록 분리한다.
        JobOutbox outbox = JobOutbox.builder()
                .requestId(event.requestId())
                .eventType(event.jobType())
                .topic(jobsTopic)
                .partitionKey(partitionKey == null || partitionKey.isBlank()
                        ? jobResourceKeyResolver.resolvePartitionKey(event)
                        : partitionKey)
                .payload(toJson(event))
                .status(JobOutboxStatus.PENDING)
                .retryCount(0)
                .maxRetryCount(5)
                .build();

        jobOutboxMapper.insert(outbox);
    }

    @Override
    public String findLatestPartitionKey(String requestId) {
        return jobOutboxMapper.selectLatestPartitionKey(requestId);
    }

    @Override
    public String resolvePartitionKey(HubJobEvent event) {
        return jobResourceKeyResolver.resolvePartitionKey(event);
    }

    private String toJson(HubJobEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to serialize outbox event", exception);
        }
    }
}
