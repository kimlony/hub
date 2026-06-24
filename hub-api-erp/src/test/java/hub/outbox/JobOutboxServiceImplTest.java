package hub.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.event.HubJobEvent;
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
     * 雅뚯눖揆??륁춿 ??源?紐? Outbox?????館釉???PENDING ?怨밴묶?? ?④쑴????μ맄 partition key揶쎛 ??而?몴?우쓺 ??밴쉐??롫뮉筌왖 野꺜筌앹빜釉??
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
     * userId/mallKey揶쎛 ??용뮉 CRAWL ??源?紐껊뮉 ?④쑴????μ맄 key??筌띾슢諭?????곸몵沃샕嚥?requestId??partition key嚥??????롫뮉筌왖 野꺜筌앹빜釉??
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
     * Outbox payload 筌욊낮??遺용퓠 ??쎈솭??롢늺 ??롢걵????源?紐? ???館釉?쭪? ??꾪???됱뇚 筌ｌ꼶???롫뮉筌왖 野꺜筌앹빜釉??
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
