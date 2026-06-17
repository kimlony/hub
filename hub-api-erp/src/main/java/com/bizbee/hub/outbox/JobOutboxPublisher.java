package com.bizbee.hub.outbox;

import com.bizbee.hub.job.HubJobEvent;
import com.bizbee.hub.port.JobEventPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.List;

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

            jobEventPort.publish(event);

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
