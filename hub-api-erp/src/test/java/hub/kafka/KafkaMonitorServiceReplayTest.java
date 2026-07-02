package hub.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.job.service.JobPayloadValidator;
import hub.kafka.dto.request.KafkaDlqReplayRequest;
import hub.kafka.dto.response.KafkaDlqReplayResponse;
import hub.kafka.service.KafkaMonitorService;
import hub.outbox.service.JobOutboxService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KafkaMonitorServiceReplayTest {

    @Mock
    private KafkaAdmin kafkaAdmin;
    @Mock
    private JdbcTemplate jdbcTemplate;
    @Mock
    private HubJobMapper hubJobMapper;
    @Mock
    private JobOutboxService jobOutboxService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void replaysOrderNormalizeWithOriginalEnvelopePayloadAndOutbox() {
        HubJob storedJob = HubJob.builder()
                .requestId("normalize-001")
                .requestKey("NORMALIZE_collect-001")
                .jobType("ORDER_NORMALIZE")
                .sourceErp("HUB")
                .parentJobId("collect-001")
                .correlationId("correlation-001")
                .causationId("collect-001")
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload("{\"sourceRequestId\":\"collect-001\",\"channelCd\":\"GODO\",\"custom\":\"keep-me\"}")
                .build();
        when(hubJobMapper.selectByRequestId("normalize-001")).thenReturn(storedJob);
        when(hubJobMapper.resetFailedJobForRetry(storedJob.getRequestKey(), storedJob.getPayload()))
                .thenReturn(1);
        when(jobOutboxService.findLatestPartitionKey("normalize-001")).thenReturn("collect-001");

        KafkaMonitorService service = new KafkaMonitorService(
                kafkaAdmin,
                jdbcTemplate,
                objectMapper,
                hubJobMapper,
                jobOutboxService,
                new JobPayloadValidator(objectMapper)
        );
        ReflectionTestUtils.setField(service, "jobsTopic", "hub.jobs");

        KafkaDlqReplayResponse response = service.replayDlqMessage(new KafkaDlqReplayRequest("""
                {
                  "failedAt":"2026-07-01T00:00:00Z",
                  "source":"consumer",
                  "errorMessage":"mapping failed",
                  "job":{"requestId":"normalize-001","jobType":"ORDER_NORMALIZE"}
                }
                """));

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobOutboxService).enqueue(eventCaptor.capture(), org.mockito.ArgumentMatchers.eq("collect-001"));
        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.jobType()).isEqualTo("ORDER_NORMALIZE");
        assertThat(event.parentJobId()).isEqualTo("collect-001");
        assertThat(event.correlationId()).isEqualTo("correlation-001");
        assertThat(event.causationId()).isEqualTo("collect-001");
        assertThat(event.payload()).containsEntry("custom", "keep-me");
        assertThat(response.requestId()).isEqualTo("normalize-001");
        assertThat(response.partitionKey()).isEqualTo("collect-001");
        assertThat(response.status()).isEqualTo("QUEUED");
    }

    @Test
    void fallsBackToCommonResolverWhenReplayHasNoPreviousOutboxKey() {
        HubJob storedJob = HubJob.builder()
                .requestId("collect-002")
                .requestKey("collect-key-002")
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .correlationId("correlation-002")
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .status(HubJobStatus.FAILED)
                .payload("{\"userId\":1,\"corpId\":100,\"channelAccountId\":10,\"mallKey\":\"GODO\",\"channelCd\":\"GODO\"}")
                .build();
        when(hubJobMapper.selectByRequestId("collect-002")).thenReturn(storedJob);
        when(hubJobMapper.resetFailedJobForRetry(storedJob.getRequestKey(), storedJob.getPayload()))
                .thenReturn(1);
        when(jobOutboxService.resolvePartitionKey(org.mockito.ArgumentMatchers.any(HubJobEvent.class)))
                .thenReturn("channel-account:100:10");

        KafkaMonitorService service = new KafkaMonitorService(
                kafkaAdmin, jdbcTemplate, objectMapper, hubJobMapper, jobOutboxService,
                new JobPayloadValidator(objectMapper));
        ReflectionTestUtils.setField(service, "jobsTopic", "hub.jobs");

        KafkaDlqReplayResponse response = service.replayDlqMessage(new KafkaDlqReplayRequest("""
                {"job":{"requestId":"collect-002","jobType":"ORDER_COLLECT"}}
                """));

        verify(jobOutboxService).enqueue(org.mockito.ArgumentMatchers.any(HubJobEvent.class));
        assertThat(response.partitionKey()).isEqualTo("channel-account:100:10");
    }

    @Test
    void replaysErpApplyAsErpApplyThroughOutbox() {
        String payload = """
                {"sourceNormalizeJobId":"normalize-003","normalizedOrderIds":[101],"corpId":100,"userId":1,"channelAccountId":10,"channelCd":"GODO","erpConnectionId":"MOCK-100","operation":"CREATE","idempotencyKey":"erp-replay-key","mockFail":true}
                """;
        HubJob storedJob = HubJob.builder()
                .requestId("erp-apply-003")
                .requestKey("ERP_APPLY_normalize-003")
                .jobType("ERP_APPLY")
                .sourceErp("HUB")
                .parentJobId("normalize-003")
                .correlationId("correlation-003")
                .causationId("normalize-003")
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload)
                .build();
        when(hubJobMapper.selectByRequestId("erp-apply-003")).thenReturn(storedJob);
        when(hubJobMapper.resetFailedJobForRetry(storedJob.getRequestKey(), payload)).thenReturn(1);
        when(jobOutboxService.findLatestPartitionKey("erp-apply-003"))
                .thenReturn("erp-connection:100:MOCK-100");
        KafkaMonitorService service = new KafkaMonitorService(
                kafkaAdmin, jdbcTemplate, objectMapper, hubJobMapper, jobOutboxService,
                new JobPayloadValidator(objectMapper));
        ReflectionTestUtils.setField(service, "jobsTopic", "hub.jobs");

        service.replayDlqMessage(new KafkaDlqReplayRequest("""
                {"job":{"requestId":"erp-apply-003","jobType":"ERP_APPLY"}}
                """));

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobOutboxService).enqueue(
                eventCaptor.capture(),
                org.mockito.ArgumentMatchers.eq("erp-connection:100:MOCK-100"));
        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.jobType()).isEqualTo("ERP_APPLY");
        assertThat(event.parentJobId()).isEqualTo("normalize-003");
        assertThat(event.correlationId()).isEqualTo("correlation-003");
        assertThat(event.payload()).containsEntry("idempotencyKey", "erp-replay-key");
        assertThat(event.payload()).containsEntry("mockFail", true);
    }
}
