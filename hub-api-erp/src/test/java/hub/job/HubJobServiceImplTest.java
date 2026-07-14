package hub.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelNotFoundException;
import hub.channel.domain.ChannelRow;
import hub.channel.mapper.ChannelMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.event.HubJobEvent;
import hub.exception.HubJobNotFoundException;
import hub.job.mapper.HubJobMapper;
import hub.job.service.HubJobServiceImpl;
import hub.job.service.JobPayloadValidator;
import hub.outbox.service.JobOutboxService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HubJobServiceImplTest {

    @Mock
    private HubJobMapper hubJobMapper;

    @Mock
    private JobOutboxService jobOutboxService;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ChannelMapper channelMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void jobListAndCountAlwaysUseAuthenticatedCorpScope() {
        when(hubJobMapper.selectJobListByCorpId(100L, null, null, 20, 0)).thenReturn(List.of());
        when(hubJobMapper.selectJobListCountByCorpId(100L, null, null)).thenReturn(0);

        var response = service().getJobs(100L, "", "", 1, 20);

        assertThat(response.jobs()).isEmpty();
        assertThat(response.totalCount()).isZero();
        verify(hubJobMapper).selectJobListByCorpId(100L, null, null, 20, 0);
        verify(hubJobMapper).selectJobListCountByCorpId(100L, null, null);
    }

    @Test
    void crossTenantJobDetailAndLogsAreHiddenAsNotFound() {
        when(hubJobMapper.selectByRequestIdAndCorpId("corp-2-job", 100L)).thenReturn(null);

        assertThatThrownBy(() -> service().getJob(100L, "corp-2-job"))
                .isInstanceOf(HubJobNotFoundException.class);
        assertThatThrownBy(() -> service().getJobLogs(100L, "corp-2-job"))
                .isInstanceOf(HubJobNotFoundException.class);

        verify(hubJobMapper, never()).selectJobLogs("corp-2-job");
    }

    @Test
    void crossTenantRetryNeverUpdatesOrPublishes() {
        when(hubJobMapper.selectByRequestIdAndCorpId("corp-2-job", 100L)).thenReturn(null);

        assertThatThrownBy(() -> service().retryJob(100L, "corp-2-job"))
                .isInstanceOf(HubJobNotFoundException.class);

        verify(hubJobMapper, never()).resetFailedJobForRetryByCorpId(any(), any(), anyLong());
        verifyNoInteractions(jobOutboxService);
    }

    /**
     * 동시 요청으로 이미 생성된 Job이 있으면 기존 Job을 반환하고 발행하지 않는지 검증한다.
     */
    @Test
    void createBatchJobsReturnsExistingJobWithoutPublishingWhenConcurrentInsertAlreadyCreatedJob() {
        HubJobServiceImpl service = new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate,
                new JobPayloadValidator(objectMapper)
        );
        HubUser user = user(1L, "admin");
        String requestKey = "SCHEDULE_77_10_GODO_20260618_20260618";
        HubJob duplicatedJob = HubJob.builder()
                .requestId("existing-request-id")
                .requestKey(requestKey)
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.QUEUED)
                .payload("{}")
                .retryCount(0)
                .build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO"))
                .thenReturn(List.of(ChannelRow.builder()
                        .id(10L)
                        .corpId(100L)
                        .userId(1L)
                        .mallKey("GODO")
                        .useYn("Y")
                        .build()));
        when(hubJobMapper.selectByRequestKey(requestKey))
                .thenReturn(null)
                .thenReturn(duplicatedJob);
        when(hubJobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(0);

        HubJobBatchResponse response = service.createScheduledBatchJobs(
                "admin",
                77L,
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        );

        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo("existing-request-id");
        assertThat(response.jobs().get(0).mallKey()).isEqualTo("GODO");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
        verify(hubJobMapper).insertJobIfAbsent(any(HubJob.class));
        verify(hubJobMapper, never()).insertJob(any(HubJob.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
        verify(hubJobMapper, times(2)).selectByRequestKey(eq(requestKey));
    }
    /**
     * 신규 Job 저장 성공 시 Outbox 이벤트를 생성하는지 검증한다.
     */
    @Test
    void createBatchJobsPublishesOutboxEventWhenNewJobInsertSucceeds() {
        HubJobServiceImpl service = new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate,
                new JobPayloadValidator(objectMapper)
        );
        HubUser user = user(1L, "admin");
        String requestKey = "SCHEDULE_77_10_GODO_20260618_20260618";

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO"))
                .thenReturn(List.of(ChannelRow.builder()
                        .id(10L)
                        .corpId(100L)
                        .userId(1L)
                        .mallKey("GODO")
                        .useYn("Y")
                        .build()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(null);
        when(hubJobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(1);

        HubJobBatchResponse response = service.createScheduledBatchJobs(
                "admin",
                77L,
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        );

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).insertJobIfAbsent(jobCaptor.capture());
        verify(jobOutboxService).enqueue(eventCaptor.capture());
        verify(hubJobMapper, never()).insertJob(any(HubJob.class));
        verify(hubJobMapper, times(1)).selectByRequestKey(eq(requestKey));

        HubJob insertedJob = jobCaptor.getValue();
        assertThat(insertedJob.getRequestKey()).isEqualTo(requestKey);
        assertThat(insertedJob.getJobType()).isEqualTo("ORDER_COLLECT");
        assertThat(insertedJob.getSourceErp()).isEqualTo("HUB");
        assertThat(insertedJob.getParentJobId()).isNull();
        assertThat(insertedJob.getCorrelationId()).isNotBlank();
        assertThat(insertedJob.getCausationId()).isNull();
        assertThat(insertedJob.getSchemaVersion()).isEqualTo("1.0");
        assertThat(insertedJob.getPayloadVersion()).isEqualTo("1.0");
        assertThat(insertedJob.getChannelCd()).isEqualTo("GODO");
        assertThat(insertedJob.getStatus()).isEqualTo(HubJobStatus.QUEUED);
        assertThat(insertedJob.getRetryCount()).isZero();

        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo(insertedJob.getRequestId());
        assertThat(event.sourceErp()).isEqualTo("HUB");
        assertThat(event.jobType()).isEqualTo("ORDER_COLLECT");
        assertThat(event.requestKey()).isEqualTo(requestKey);
        assertThat(event.parentJobId()).isNull();
        assertThat(event.correlationId()).isEqualTo(insertedJob.getCorrelationId());
        assertThat(event.causationId()).isNull();
        assertThat(event.schemaVersion()).isEqualTo("1.0");
        assertThat(event.payloadVersion()).isEqualTo("1.0");
        assertThat(event.payload())
                .containsEntry("userId", 1)
                .containsEntry("corpId", 100)
                .containsEntry("channelAccountId", 10)
                .containsEntry("mallKey", "GODO")
                .containsEntry("channelCd", "GODO")
                .containsEntry("frDt", "20260618")
                .containsEntry("toDt", "20260618")
                .containsEntry("triggerType", "SCHEDULE");

        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo(insertedJob.getRequestId());
        assertThat(response.jobs().get(0).mallKey()).isEqualTo("GODO");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
    }

    /**
     * 이미 대기 중인 Job은 초기화하지 않고 그대로 반환하는지 검증한다.
     */
    @Test
    void createBatchJobsReturnsExistingJobWithoutResetWhenJobIsAlreadyQueued() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "SCHEDULE_77_10_GODO_20260618_20260618";
        HubJob existingJob = HubJob.builder()
                .requestId("queued-request-id")
                .requestKey(requestKey)
                .channelCd("GODO")
                .status(HubJobStatus.QUEUED)
                .build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO")).thenReturn(List.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);

        HubJobBatchResponse response = service.createScheduledBatchJobs(
                "admin",
                77L,
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        );

        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo("queued-request-id");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
        verify(hubJobMapper, never()).insertJobIfAbsent(any(HubJob.class));
        verify(hubJobMapper, never()).updateStatusToReset(any(String.class), any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * 완료된 Job을 재요청하면 대기 상태로 초기화하고 Outbox 이벤트를 생성하는지 검증한다.
     */
    @Test
    void createBatchJobsResetsCompletedJobAndPublishesOutboxEvent() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "SCHEDULE_77_10_GODO_20260618_20260618";
        HubJob existingJob = HubJob.builder()
                .requestId("completed-request-id")
                .requestKey(requestKey)
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.SUCCESS)
                .payload(payload())
                .retryCount(1)
                .build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO")).thenReturn(List.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);
        when(hubJobMapper.updateStatusToReset(eq(requestKey), any(String.class))).thenReturn(1);

        HubJobBatchResponse response = service.createScheduledBatchJobs(
                "admin",
                77L,
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        );

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).updateStatusToReset(eq(requestKey), any(String.class));
        verify(jobOutboxService).enqueue(eventCaptor.capture());
        verify(hubJobMapper, never()).insertJobIfAbsent(any(HubJob.class));

        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo("completed-request-id");
        assertThat(event.requestKey()).isEqualTo(requestKey);
        assertThat(event.payload())
                .containsEntry("mallKey", "GODO")
                .containsEntry("channelCd", "GODO")
                .containsEntry("triggerType", "SCHEDULE");
        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo("completed-request-id");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
    }

    /**
     * 완료 Job 초기화가 실패하면 Outbox 이벤트를 생성하지 않는지 검증한다.
     */
    @Test
    void createBatchJobsDoesNotPublishWhenCompletedJobResetIsSkipped() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "SCHEDULE_77_10_GODO_20260618_20260618";
        HubJob existingJob = HubJob.builder()
                .requestId("completed-request-id")
                .requestKey(requestKey)
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.SUCCESS)
                .payload(payload())
                .retryCount(1)
                .build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO")).thenReturn(List.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);
        when(hubJobMapper.updateStatusToReset(eq(requestKey), any(String.class))).thenReturn(0);

        assertThatThrownBy(() -> service.createScheduledBatchJobs(
                "admin",
                77L,
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Job reset skipped because current status is not completed");

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void createBatchJobsCreatesNewExecutionForRepeatedManualCollection() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO")).thenReturn(List.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(any(String.class))).thenReturn(null);
        when(hubJobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(1);

        HubJobBatchRequest request = new HubJobBatchRequest("20260618", "20260618", List.of("GODO"));
        HubJobBatchResponse first = service.createBatchJobs("admin", request);
        HubJobBatchResponse second = service.createBatchJobs("admin", request);

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        verify(hubJobMapper, times(2)).insertJobIfAbsent(jobCaptor.capture());
        verify(jobOutboxService, times(2)).enqueue(any(HubJobEvent.class));
        verify(hubJobMapper, never()).updateStatusToReset(any(String.class), any(String.class));

        List<HubJob> insertedJobs = jobCaptor.getAllValues();
        assertThat(insertedJobs).hasSize(2);
        assertThat(insertedJobs.get(0).getRequestKey()).startsWith("MANUAL_");
        assertThat(insertedJobs.get(1).getRequestKey()).startsWith("MANUAL_");
        assertThat(insertedJobs.get(0).getRequestKey()).isNotEqualTo(insertedJobs.get(1).getRequestKey());
        assertThat(first.jobs().get(0).requestId()).isNotEqualTo(second.jobs().get(0).requestId());
    }

    /**
     * 활성 채널 계정이 없으면 Job 생성을 거부하는지 검증한다.
     */
    @Test
    void createBatchJobsThrowsWhenChannelIsNotActive() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndMallKey(100L, "GODO")).thenReturn(List.of());

        assertThatThrownBy(() -> service.createBatchJobs(
                "admin",
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        ))
                .isInstanceOf(hub.channel.ChannelNotFoundException.class)
                .hasMessage("GODO channel has no active account");

        verify(hubJobMapper, never()).selectByRequestKey(any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * 실패한 Job을 재시도 상태로 초기화하고 Outbox 이벤트를 생성하는지 검증한다.
     */
    @Test
    void retryJobResetsFailedJobAndPublishesOutboxEvent() {
        HubJobServiceImpl service = service();
        HubJob failedJob = HubJob.builder()
                .requestId("failed-request-id")
                .requestKey("10_GODO_20260618_20260618")
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .parentJobId(null)
                .correlationId("collect-correlation")
                .causationId(null)
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload())
                .retryCount(3)
                .build();

        when(hubJobMapper.selectByRequestIdAndCorpId("failed-request-id", 100L)).thenReturn(failedJob);
        when(hubJobMapper.resetFailedJobForRetryByCorpId(eq(failedJob.getRequestKey()), any(String.class), eq(100L))).thenReturn(1);

        service.retryJob(100L, "failed-request-id");

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).resetFailedJobForRetryByCorpId(eq(failedJob.getRequestKey()), any(String.class), eq(100L));
        verify(jobOutboxService).enqueue(eventCaptor.capture());
        assertThat(eventCaptor.getValue().requestId()).isEqualTo("failed-request-id");
        assertThat(eventCaptor.getValue().requestKey()).isEqualTo(failedJob.getRequestKey());
        assertThat(eventCaptor.getValue().jobType()).isEqualTo("ORDER_COLLECT");
        assertThat(eventCaptor.getValue().correlationId()).isEqualTo("collect-correlation");
        assertThat(eventCaptor.getValue().payload()).containsEntry("channelCd", "GODO");
    }

    /**
     * 실패 상태가 아닌 Job의 수동 재시도를 거부하는지 검증한다.
     */
    @Test
    void retryJobRejectsJobThatIsNotFailed() {
        HubJobServiceImpl service = service();
        HubJob processingJob = HubJob.builder()
                .requestId("processing-request-id")
                .requestKey("10_GODO_20260618_20260618")
                .status(HubJobStatus.PROCESSING)
                .build();

        when(hubJobMapper.selectByRequestIdAndCorpId("processing-request-id", 100L)).thenReturn(processingJob);

        assertThatThrownBy(() -> service.retryJob(100L, "processing-request-id"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Only FAILED jobs can be retried");

        verify(hubJobMapper, never()).resetFailedJobForRetryByCorpId(any(String.class), any(String.class), eq(100L));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * 재시도 초기화가 실패하면 Outbox 이벤트를 생성하지 않는지 검증한다.
     */
    @Test
    void retryJobDoesNotPublishWhenResetIsSkipped() {
        HubJobServiceImpl service = service();
        HubJob failedJob = HubJob.builder()
                .requestId("failed-request-id")
                .requestKey("10_GODO_20260618_20260618")
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload())
                .retryCount(3)
                .build();

        when(hubJobMapper.selectByRequestIdAndCorpId("failed-request-id", 100L)).thenReturn(failedJob);
        when(hubJobMapper.resetFailedJobForRetryByCorpId(eq(failedJob.getRequestKey()), any(String.class), eq(100L))).thenReturn(0);

        assertThatThrownBy(() -> service.retryJob(100L, "failed-request-id"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Job retry skipped because current status is not FAILED");

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void retryRejectsQueuedJobWithoutCreatingOutbox() {
        HubJob queuedJob = HubJob.builder()
                .requestId("queued-request-id")
                .requestKey("queued-request-key")
                .jobType("ORDER_COLLECT")
                .status(HubJobStatus.QUEUED)
                .build();
        when(hubJobMapper.selectByRequestIdAndCorpId("queued-request-id", 100L)).thenReturn(queuedJob);

        assertThatThrownBy(() -> service().retryJob(100L, "queued-request-id"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Only FAILED jobs can be retried");

        verify(hubJobMapper, never()).resetFailedJobForRetryByCorpId(any(String.class), any(String.class), eq(100L));
        verify(jobOutboxService, never()).findLatestPartitionKey(any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void retryInvalidPayloadDoesNotResetJobOrCreateOutbox() {
        HubJob failedJob = HubJob.builder()
                .requestId("invalid-normalize-request-id")
                .requestKey("NORMALIZE_collect-invalid")
                .jobType("ORDER_NORMALIZE")
                .sourceErp("HUB")
                .parentJobId("collect-invalid")
                .correlationId("correlation-invalid")
                .causationId("collect-invalid")
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload("{\"channelCd\":\"GODO\"}")
                .build();
        when(hubJobMapper.selectByRequestIdAndCorpId("invalid-normalize-request-id", 100L)).thenReturn(failedJob);

        assertThatThrownBy(() -> service().retryJob(100L, "invalid-normalize-request-id"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("sourceRequestId is required for retry");

        verify(hubJobMapper, never()).resetFailedJobForRetryByCorpId(any(String.class), any(String.class), eq(100L));
        verify(jobOutboxService, never()).findLatestPartitionKey(any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void retryOrderNormalizePreservesEnvelopePayloadAndPartitionKey() {
        HubJobServiceImpl service = service();
        String originalPayload = """
                {"sourceRequestId":"collect-001","channelCd":"GODO","userId":1,"custom":"keep-me"}
                """;
        HubJob failedJob = HubJob.builder()
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
                .payload(originalPayload)
                .retryCount(3)
                .build();

        when(hubJobMapper.selectByRequestIdAndCorpId("normalize-001", 100L)).thenReturn(failedJob);
        when(jobOutboxService.findLatestPartitionKey("normalize-001")).thenReturn("collect-001");
        when(hubJobMapper.resetFailedJobForRetryByCorpId(failedJob.getRequestKey(), originalPayload, 100L)).thenReturn(1);

        service.retryJob(100L, "normalize-001");

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobOutboxService).enqueue(eventCaptor.capture(), eq("collect-001"));
        verify(hubJobMapper).resetFailedJobForRetryByCorpId(failedJob.getRequestKey(), originalPayload, 100L);
        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.jobType()).isEqualTo("ORDER_NORMALIZE");
        assertThat(event.parentJobId()).isEqualTo("collect-001");
        assertThat(event.correlationId()).isEqualTo("correlation-001");
        assertThat(event.causationId()).isEqualTo("collect-001");
        assertThat(event.schemaVersion()).isEqualTo("1.0");
        assertThat(event.payloadVersion()).isEqualTo("1.0");
        assertThat(event.payload()).containsEntry("custom", "keep-me");
    }

    @Test
    void retryErpApplyKeepsJobTypePayloadAndCorrelation() {
        HubJobServiceImpl service = service();
        String payload = """
                {"sourceNormalizeJobId":"normalize-001","normalizedOrderIds":[11],"corpId":100,"userId":1,"channelAccountId":10,"channelCd":"GODO","erpConnectionId":"MOCK-100","operation":"CREATE","idempotencyKey":"erp-key-001","mockFail":true}
                """;
        HubJob failedJob = HubJob.builder()
                .requestId("erp-apply-001")
                .requestKey("ERP_APPLY_normalize-001")
                .jobType("ERP_APPLY")
                .sourceErp("HUB")
                .parentJobId("normalize-001")
                .correlationId("correlation-001")
                .causationId("normalize-001")
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload)
                .retryCount(3)
                .build();
        when(hubJobMapper.selectByRequestIdAndCorpId("erp-apply-001", 100L)).thenReturn(failedJob);
        when(jobOutboxService.findLatestPartitionKey("erp-apply-001"))
                .thenReturn("erp-connection:100:MOCK-100");
        when(hubJobMapper.resetFailedJobForRetryByCorpId(failedJob.getRequestKey(), payload, 100L)).thenReturn(1);

        service.retryJob(100L, "erp-apply-001");

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobOutboxService).enqueue(eventCaptor.capture(), eq("erp-connection:100:MOCK-100"));
        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo("erp-apply-001");
        assertThat(event.requestKey()).isEqualTo("ERP_APPLY_normalize-001");
        assertThat(event.jobType()).isEqualTo("ERP_APPLY");
        assertThat(event.parentJobId()).isEqualTo("normalize-001");
        assertThat(event.correlationId()).isEqualTo("correlation-001");
        assertThat(event.causationId()).isEqualTo("normalize-001");
        assertThat(event.schemaVersion()).isEqualTo("1.0");
        assertThat(event.payloadVersion()).isEqualTo("1.0");
        assertThat(event.payload()).containsEntry("idempotencyKey", "erp-key-001");
        assertThat(event.payload()).containsEntry("mockFail", true);
        verify(hubJobMapper).resetFailedJobForRetryByCorpId(failedJob.getRequestKey(), payload, 100L);
    }

    @Test
    void retryRejectsAlreadySuccessfulErpApply() {
        HubJob successfulJob = HubJob.builder()
                .requestId("erp-success-001")
                .jobType("ERP_APPLY")
                .status(HubJobStatus.SUCCESS)
                .build();
        when(hubJobMapper.selectByRequestIdAndCorpId("erp-success-001", 100L)).thenReturn(successfulJob);

        assertThatThrownBy(() -> service().retryJob(100L, "erp-success-001"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Only FAILED jobs can be retried");
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    private HubJobServiceImpl service() {
        return new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate,
                new JobPayloadValidator(objectMapper)
        );
    }

    private ChannelRow activeChannel() {
        return ChannelRow.builder()
                .id(10L)
                .corpId(100L)
                .userId(1L)
                .mallKey("GODO")
                .useYn("Y")
                .build();
    }

    private String payload() {
        return """
                {"userId":1,"corpId":100,"channelAccountId":10,"mallKey":"GODO","channelCd":"GODO","frDt":"20260618","toDt":"20260618","triggerType":"MANUAL"}
                """;
    }

    private HubUser user(Long id, String username) {
        HubUser user = new HubUser();
        user.setId(id);
        user.setCorpId(100L);
        user.setCorpCd("TEST-CORP");
        user.setUsername(username);
        return user;
    }
}
