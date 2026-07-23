package hub.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
import hub.outbox.domain.JobOutbox;
import hub.outbox.mapper.JobOutboxMapper;
import hub.port.JobEventPort;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class JobOutboxPublisher {

    private final JobOutboxMapper jobOutboxMapper;
    private final JobEventPort jobEventPort;
    private final ObjectMapper objectMapper;

    @Value("${hub.outbox.batch-size:50}")
    private int batchSize;

    @Value("${hub.outbox.publishing-stale-seconds:300}")
    private int publishingStaleSeconds;
    // KAFKA 발행을 하기위해 out_box에 저장된 PENDING값을 가진 로우를 가져오는 스케쥴러
    // 먼저 claim하여 여러 Publisher가 같은 pending row를 동시에 발행하지 못하게 한다.
    // 오래된 PUBLISHING row는 다시 reclaim할 수 있다.
    @Scheduled(fixedDelayString = "${hub.outbox.publish-delay-ms:3000}")
    public void publishPendingEvents() {
        String lockedBy = buildLockedBy();

        List<JobOutbox> events = jobOutboxMapper.claimPending(batchSize, lockedBy, publishingStaleSeconds);

        if (events.isEmpty()) {
            return;
        }

        for (JobOutbox event : events) {
            publishOne(event);
        }
    }

    private void publishOne(JobOutbox outbox) {
        try {
            HubJobEvent event = objectMapper.readValue(outbox.getPayload(), HubJobEvent.class);

            // 아웃박스 레코드를 생성(발행)하는 주체가 순서 제어권을 갖는다
            // 이미 (DB에) 저장된 Key를 그대로 재사용하는 것은 재시도(Retry)나 재생(Replay) 시에도 동일한 파티션으로만 가도록 묶어준다
            jobEventPort.publish(event, outbox.getPartitionKey());

            jobOutboxMapper.markSent(outbox.getId());

            log.info(
                    "outbox event published: id={}, requestId={}, eventType={}",
                    outbox.getId(),
                    outbox.getRequestId(),
                    outbox.getEventType()
            );
        } catch (Exception exception) {
            handlePublishFailure(outbox, exception);
        }
    }

    private void handlePublishFailure(JobOutbox outbox, Exception exception) {
        String errorMessage = truncate(exception.getMessage());

        int retryCount = outbox.getRetryCount() == null ? 0 : outbox.getRetryCount();
        int maxRetryCount = outbox.getMaxRetryCount() == null ? 5 : outbox.getMaxRetryCount();

        if (retryCount + 1 >= maxRetryCount) {
            jobOutboxMapper.markFailed(outbox.getId(), errorMessage);
            log.warn(
                    "outbox event publish failed permanently: id={}, requestId={}, retryCount={}, maxRetryCount={}",
                    outbox.getId(),
                    outbox.getRequestId(),
                    retryCount + 1,
                    maxRetryCount,
                    exception
            );
            return;
        }

        int delaySeconds = calculateBackoffSeconds(retryCount + 1);
        jobOutboxMapper.markRetry(outbox.getId(), errorMessage, delaySeconds);

        log.warn(
                "outbox event publish failed and will retry: id={}, requestId={}, retryCount={}, delaySeconds={}",
                outbox.getId(),
                outbox.getRequestId(),
                retryCount + 1,
                delaySeconds,
                exception
        );
    }

    private int calculateBackoffSeconds(int retryCount) {
        return switch (retryCount) {
            case 1 -> 10;
            case 2 -> 30;
            case 3 -> 60;
            case 4 -> 180;
            default -> 300;
        };
    }

    private String buildLockedBy() {
        return "api:" + hostName();
    }

    private String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException exception) {
            return "unknown";
        }
    }

    private String truncate(String message) {
        if (message == null || message.isBlank()) {
            return "unknown publish error";
        }
        return message.length() > 1000 ? message.substring(0, 1000) : message;
    }
}
