package com.bizbee.hub.outbox;

import com.bizbee.hub.job.HubJobEvent;
import com.bizbee.hub.port.JobEventPort;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobOutboxPublisherTest {

    @Mock
    private JobOutboxMapper jobOutboxMapper;

    @Mock
    private JobEventPort jobEventPort;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Outbox에서 가져온 이벤트가 정상적으로 Kafka에 발행되면 SENT 상태로 변경되는지 검증한다.
     */
    @Test
    void publishesClaimedOutboxEventAndMarksSent() throws Exception {
        JobOutboxPublisher publisher = publisher();
        JobOutbox outbox = outbox(
                10L,
                objectMapper.writeValueAsString(event("request-001")),
                0,
                5
        );

        when(jobOutboxMapper.claimPending(eq(2), any(String.class), eq(60)))
                .thenReturn(List.of(outbox));

        publisher.publishPendingEvents();

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobEventPort).publish(eventCaptor.capture());
        verify(jobOutboxMapper).markSent(10L);
        verify(jobOutboxMapper, never()).markRetry(any(Long.class), any(String.class), any(Integer.class));
        verify(jobOutboxMapper, never()).markFailed(any(Long.class), any(String.class));

        HubJobEvent publishedEvent = eventCaptor.getValue();
        assertThat(publishedEvent.requestId()).isEqualTo("request-001");
        assertThat(publishedEvent.jobType()).isEqualTo("ORDER_COLLECT");
        assertThat(publishedEvent.payload()).containsEntry("channelCd", "GODO");
    }

    /**
     * Kafka 발행이 실패했지만 최대 재시도 횟수 전이면 RETRY 대상으로 되돌리는지 검증한다.
     */
    @Test
    void marksRetryWhenKafkaPublishFailsBeforeMaxRetry() throws Exception {
        JobOutboxPublisher publisher = publisher();
        JobOutbox outbox = outbox(
                11L,
                objectMapper.writeValueAsString(event("request-002")),
                0,
                5
        );

        when(jobOutboxMapper.claimPending(eq(2), any(String.class), eq(60)))
                .thenReturn(List.of(outbox));
        doThrow(new RuntimeException("kafka down")).when(jobEventPort).publish(any(HubJobEvent.class));

        publisher.publishPendingEvents();

        verify(jobOutboxMapper).markRetry(11L, "kafka down", 10);
        verify(jobOutboxMapper, never()).markSent(any(Long.class));
        verify(jobOutboxMapper, never()).markFailed(any(Long.class), any(String.class));
    }

    /**
     * Kafka 발행 실패가 최대 재시도 횟수에 도달하면 FAILED 상태로 변경되는지 검증한다.
     */
    @Test
    void marksFailedWhenKafkaPublishFailsAtMaxRetry() throws Exception {
        JobOutboxPublisher publisher = publisher();
        JobOutbox outbox = outbox(
                12L,
                objectMapper.writeValueAsString(event("request-003")),
                4,
                5
        );

        when(jobOutboxMapper.claimPending(eq(2), any(String.class), eq(60)))
                .thenReturn(List.of(outbox));
        doThrow(new RuntimeException("kafka down")).when(jobEventPort).publish(any(HubJobEvent.class));

        publisher.publishPendingEvents();

        verify(jobOutboxMapper).markFailed(12L, "kafka down");
        verify(jobOutboxMapper, never()).markSent(any(Long.class));
        verify(jobOutboxMapper, never()).markRetry(any(Long.class), any(String.class), any(Integer.class));
    }

    /**
     * Outbox payload JSON 파싱에 실패하면 Kafka 발행 없이 RETRY 대상으로 되돌리는지 검증한다.
     */
    @Test
    void marksRetryWhenOutboxPayloadCannotBeParsed() {
        JobOutboxPublisher publisher = publisher();
        JobOutbox outbox = outbox(13L, "{invalid-json", 1, 5);

        when(jobOutboxMapper.claimPending(eq(2), any(String.class), eq(60)))
                .thenReturn(List.of(outbox));

        publisher.publishPendingEvents();

        verify(jobEventPort, never()).publish(any(HubJobEvent.class));
        verify(jobOutboxMapper).markRetry(eq(13L), any(String.class), eq(30));
        verify(jobOutboxMapper, never()).markSent(any(Long.class));
    }

    /**
     * 발행 대상 Outbox 이벤트가 없으면 Kafka 발행이나 상태 변경을 수행하지 않는지 검증한다.
     */
    @Test
    void doesNothingWhenNoOutboxEventIsClaimed() {
        JobOutboxPublisher publisher = publisher();

        when(jobOutboxMapper.claimPending(eq(2), any(String.class), eq(60)))
                .thenReturn(List.of());

        publisher.publishPendingEvents();

        verify(jobEventPort, never()).publish(any(HubJobEvent.class));
        verify(jobOutboxMapper, never()).markSent(any(Long.class));
        verify(jobOutboxMapper, never()).markRetry(any(Long.class), any(String.class), any(Integer.class));
        verify(jobOutboxMapper, never()).markFailed(any(Long.class), any(String.class));
    }

    private JobOutboxPublisher publisher() {
        JobOutboxPublisher publisher = new JobOutboxPublisher(jobOutboxMapper, jobEventPort, objectMapper);
        ReflectionTestUtils.setField(publisher, "batchSize", 2);
        ReflectionTestUtils.setField(publisher, "publishingStaleSeconds", 60);
        return publisher;
    }

    private HubJobEvent event(String requestId) {
        return new HubJobEvent(
                requestId,
                "HUB",
                "ORDER_COLLECT",
                "GODO_20260618_20260618_admin",
                Map.of(
                        "userId", 1,
                        "mallKey", "GODO",
                        "channelCd", "GODO"
                )
        );
    }

    private JobOutbox outbox(Long id, String payload, Integer retryCount, Integer maxRetryCount) {
        return JobOutbox.builder()
                .id(id)
                .requestId("request-" + id)
                .eventType("ORDER_COLLECT")
                .topic("hub.jobs")
                .partitionKey("ORDER_COLLECT:1:GODO")
                .payload(payload)
                .status(JobOutboxStatus.PUBLISHING)
                .retryCount(retryCount)
                .maxRetryCount(maxRetryCount)
                .build();
    }
}
