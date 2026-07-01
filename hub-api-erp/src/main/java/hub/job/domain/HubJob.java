package hub.job.domain;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HubJob {

    private String requestId;
    private String requestKey;
    private String jobType;
    private String sourceErp;
    private String parentJobId;
    private String correlationId;
    private String causationId;
    private String schemaVersion;
    private String payloadVersion;
    private String channelCd;
    private HubJobStatus status;
    private String payload;
    private int retryCount;
    private String errorMessage;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
