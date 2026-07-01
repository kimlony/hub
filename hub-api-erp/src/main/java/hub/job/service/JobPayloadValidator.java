package hub.job.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.domain.HubJob;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JobPayloadValidator {

    private final ObjectMapper objectMapper;

    public Map<String, Object> validate(HubJob job) {
        Map<String, Object> payload = parse(job.getPayload());
        switch (job.getJobType()) {
            case "ORDER_COLLECT" -> {
                require(payload, "channelCd");
                require(payload, "mallKey");
                require(payload, "userId");
            }
            case "ORDER_NORMALIZE" -> {
                require(payload, "sourceRequestId");
                require(payload, "channelCd");
            }
            default -> {
                // Extension point: future Job Types add their payload contract here.
            }
        }
        return payload;
    }

    private Map<String, Object> parse(String payload) {
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException("job payload is required");
        }
        try {
            return objectMapper.readValue(payload, new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("job payload is not valid JSON", exception);
        }
    }

    private void require(Map<String, Object> payload, String field) {
        Object value = payload.get(field);
        if (value == null || value instanceof String text && text.isBlank()) {
            throw new IllegalArgumentException(field + " is required for retry");
        }
    }
}
