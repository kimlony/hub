package hub.adapter.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
import hub.port.JobEventPort;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
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
        publish(event, buildPartitionKey(event));
    }

    @Override
    public void publish(HubJobEvent event, String partitionKey) {
        try {
            var result = kafkaTemplate.send(jobsTopic, partitionKey, toJson(event)).get();

            log.debug(
                    "Published hub job event. requestId={}, partitionKey={}, topic={}, partition={}, offset={}",
                    event.requestId(),
                    partitionKey,
                    result.getRecordMetadata().topic(),
                    result.getRecordMetadata().partition(),
                    result.getRecordMetadata().offset()
            );
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Kafka 발행을 실패했습니다. requestId=" + event.requestId(),
                    exception
            );
        }
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
            throw new IllegalStateException("Kafka 발행을 실패했습니다. requestId=" + event.requestId(), exception);
        }
    }
}
