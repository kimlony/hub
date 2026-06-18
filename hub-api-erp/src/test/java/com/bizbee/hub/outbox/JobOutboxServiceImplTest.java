package com.bizbee.hub.outbox;

import com.bizbee.hub.job.HubJobEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobOutboxServiceImplTest {

    @Mock
    private JobOutboxMapper jobOutboxMapper;

    @Mock
    private ObjectMapper objectMapper;

    /**
     * 주문수집 이벤트를 Outbox에 저장할 때 PENDING 상태와 계정 단위 partition key가 올바르게 생성되는지 검증한다.
     */
    @Test
    void enqueueCreatesPendingOutboxWithAccountPartitionKey() throws Exception {
        JobOutboxServiceImpl service = service(new ObjectMapper());
        HubJobEvent event = new HubJobEvent(
                "request-001",
                "HUB",
                "ORDER_COLLECT",
                "GODO_20260618_20260618_admin",
                Map.of(
                        "userId", 1,
                        "mallKey", "GODO",
                        "channelCd", "GODO"
                )
        );

        service.enqueue(event);

        ArgumentCaptor<JobOutbox> outboxCaptor = ArgumentCaptor.forClass(JobOutbox.class);
        verify(jobOutboxMapper).insert(outboxCaptor.capture());

        JobOutbox outbox = outboxCaptor.getValue();
        assertThat(outbox.getRequestId()).isEqualTo("request-001");
        assertThat(outbox.getEventType()).isEqualTo("ORDER_COLLECT");
        assertThat(outbox.getTopic()).isEqualTo("hub.jobs");
        assertThat(outbox.getPartitionKey()).isEqualTo("ORDER_COLLECT:1:GODO");
        assertThat(outbox.getStatus()).isEqualTo(JobOutboxStatus.PENDING);
        assertThat(outbox.getRetryCount()).isZero();
        assertThat(outbox.getMaxRetryCount()).isEqualTo(5);
        assertThat(outbox.getPayload()).contains("\"requestId\":\"request-001\"");
    }

    /**
     * userId/mallKey가 없는 CRAWL 이벤트는 계정 단위 key를 만들 수 없으므로 requestId를 partition key로 사용하는지 검증한다.
     */
    @Test
    void enqueueFallsBackToRequestIdWhenPayloadHasNoAccountKey() {
        JobOutboxServiceImpl service = service(new ObjectMapper());
        HubJobEvent event = new HubJobEvent(
                "crawl-request-001",
                "HUB",
                "CRAWL",
                "CRAWL_DART_20260618_1200",
                Map.of("channelCd", "DART")
        );

        service.enqueue(event);

        ArgumentCaptor<JobOutbox> outboxCaptor = ArgumentCaptor.forClass(JobOutbox.class);
        verify(jobOutboxMapper).insert(outboxCaptor.capture());

        JobOutbox outbox = outboxCaptor.getValue();
        assertThat(outbox.getPartitionKey()).isEqualTo("crawl-request-001");
        assertThat(outbox.getTopic()).isEqualTo("hub.jobs");
        assertThat(outbox.getStatus()).isEqualTo(JobOutboxStatus.PENDING);
    }

    /**
     * Outbox payload 직렬화에 실패하면 잘못된 이벤트를 저장하지 않고 예외 처리하는지 검증한다.
     */
    @Test
    void enqueueThrowsWhenPayloadSerializationFails() throws Exception {
        JobOutboxServiceImpl service = service(objectMapper);
        HubJobEvent event = new HubJobEvent(
                "request-001",
                "HUB",
                "ORDER_COLLECT",
                "request-key",
                Map.of("userId", 1, "mallKey", "GODO")
        );

        when(objectMapper.writeValueAsString(any(HubJobEvent.class)))
                .thenThrow(new JsonProcessingException("serialize failed") {
                });

        assertThatThrownBy(() -> service.enqueue(event))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("failed to serialize outbox event");
    }

    private JobOutboxServiceImpl service(ObjectMapper objectMapper) {
        JobOutboxServiceImpl service = new JobOutboxServiceImpl(jobOutboxMapper, objectMapper);
        ReflectionTestUtils.setField(service, "jobsTopic", "hub.jobs");
        return service;
    }
}
