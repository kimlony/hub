package hub.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
import hub.job.key.JobResourceKeyResolver;
import hub.outbox.domain.JobOutbox;
import hub.outbox.domain.JobOutboxStatus;
import hub.outbox.mapper.JobOutboxMapper;
import hub.outbox.service.JobOutboxServiceImpl;
import java.util.Map;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.test.util.ReflectionTestUtils;
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
     * 채널 계정 파티션 키를 사용한 대기 상태 Outbox 이벤트를 생성하는지 검증한다.
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
                        "corpId", 100,
                        "channelAccountId", 10,
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
        assertThat(outbox.getPartitionKey()).isEqualTo("channel-account:100:10");
        assertThat(outbox.getStatus()).isEqualTo(JobOutboxStatus.PENDING);
        assertThat(outbox.getRetryCount()).isZero();
        assertThat(outbox.getMaxRetryCount()).isEqualTo(5);
        assertThat(outbox.getPayload()).contains("\"requestId\":\"request-001\"");
    }

    /**
     * 채널 계정 키가 없으면 요청 ID를 파티션 키로 사용하는지 검증한다.
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

    @Test
    void enqueueUsesSourceRequestIdForOrderNormalize() {
        JobOutboxServiceImpl service = service(new ObjectMapper());
        HubJobEvent event = new HubJobEvent(
                "normalize-001",
                "HUB",
                "ORDER_NORMALIZE",
                "NORMALIZE_collect-001",
                Map.of(
                        "sourceRequestId", "collect-001",
                        "channelAccountId", 10,
                        "channelCd", "GODO"
                )
        );

        service.enqueue(event);

        ArgumentCaptor<JobOutbox> outboxCaptor = ArgumentCaptor.forClass(JobOutbox.class);
        verify(jobOutboxMapper).insert(outboxCaptor.capture());
        assertThat(outboxCaptor.getValue().getPartitionKey()).isEqualTo("collect-001");
    }

    /**
     * Outbox payload 직렬화 실패 시 예외를 발생시키는지 검증한다.
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
        JobOutboxServiceImpl service = new JobOutboxServiceImpl(
                jobOutboxMapper, objectMapper, new JobResourceKeyResolver());
        ReflectionTestUtils.setField(service, "jobsTopic", "hub.jobs");
        return service;
    }
}
