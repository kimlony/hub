package hub.outbox.domain;

import java.time.OffsetDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobOutbox {

    private Long id;

    private String requestId;
    private String eventType;
    private String topic;
    private String partitionKey;
    private String payload;

    private JobOutboxStatus status;
    private Integer retryCount;
    private Integer maxRetryCount;
    private OffsetDateTime nextRetryAt;

    private String lockedBy;
    private OffsetDateTime lockedAt;

    private String lastError;
    private OffsetDateTime publishedAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}