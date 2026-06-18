package com.bizbee.hub.job;

import com.bizbee.hub.auth.HubUser;
import com.bizbee.hub.auth.UserMapper;
import com.bizbee.hub.channel.ChannelMapper;
import com.bizbee.hub.channel.ChannelRow;
import com.bizbee.hub.outbox.JobOutboxService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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

    /**
     * 같은 주문수집 요청이 거의 동시에 들어왔을 때
     * 중복 Job을 생성하지 않고 Outbox/Kafka 발행도 중복하지 않으면서
     * 기존 Job을 안정적으로 반환하는지 확인하는 테스트
     */
    @Test
    void createBatchJobsReturnsExistingJobWithoutPublishingWhenConcurrentInsertAlreadyCreatedJob() {
        HubJobServiceImpl service = new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate
        );
        HubUser user = user(1L, "admin");
        String requestKey = "GODO_20260618_20260618_admin";
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
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO"))
                .thenReturn(Optional.of(ChannelRow.builder()
                        .userId(1L)
                        .mallKey("GODO")
                        .useYn("Y")
                        .build()));
        when(hubJobMapper.selectByRequestKey(requestKey))
                .thenReturn(null)
                .thenReturn(duplicatedJob);
        when(hubJobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(0);

        HubJobBatchResponse response = service.createBatchJobs(
                "admin",
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
     * 신규 주문수집 요청에서 requestKey 기준 기존 Job이 없고 insert가 성공한 경우,
     * Outbox 이벤트가 정상 생성되는지 단위 테스트로 검증했습니다.
     * 이를 통해 Job 생성과 Worker 처리 이벤트 발행이 함께 연결되는 정상 흐름을 보장하고,
     * 중복 요청 방어 로직과 신규 생성 로직을 각각 테스트로 분리해 멱등 처리의 양쪽 분기를 검증했습니다.
     */

    @Test
    void createBatchJobsPublishesOutboxEventWhenNewJobInsertSucceeds() {
        HubJobServiceImpl service = new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate
        );
        HubUser user = user(1L, "admin");
        String requestKey = "GODO_20260618_20260618_admin";

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO"))
                .thenReturn(Optional.of(ChannelRow.builder()
                        .userId(1L)
                        .mallKey("GODO")
                        .useYn("Y")
                        .build()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(null);
        when(hubJobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(1);

        HubJobBatchResponse response = service.createBatchJobs(
                "admin",
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
        assertThat(insertedJob.getChannelCd()).isEqualTo("GODO");
        assertThat(insertedJob.getStatus()).isEqualTo(HubJobStatus.QUEUED);
        assertThat(insertedJob.getRetryCount()).isZero();

        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo(insertedJob.getRequestId());
        assertThat(event.sourceErp()).isEqualTo("HUB");
        assertThat(event.jobType()).isEqualTo("ORDER_COLLECT");
        assertThat(event.requestKey()).isEqualTo(requestKey);
        assertThat(event.payload())
                .containsEntry("userId", 1)
                .containsEntry("mallKey", "GODO")
                .containsEntry("channelCd", "GODO")
                .containsEntry("frDt", "20260618")
                .containsEntry("toDt", "20260618")
                .containsEntry("triggerType", "MANUAL");

        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo(insertedJob.getRequestId());
        assertThat(response.jobs().get(0).mallKey()).isEqualTo("GODO");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
    }

    /**
     * 이미 QUEUED 상태의 Job이 있으면 중복 생성이나 재발행 없이 기존 Job을 반환하는지 검증한다.
     */
    @Test
    void createBatchJobsReturnsExistingJobWithoutResetWhenJobIsAlreadyQueued() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "GODO_20260618_20260618_admin";
        HubJob existingJob = HubJob.builder()
                .requestId("queued-request-id")
                .requestKey(requestKey)
                .channelCd("GODO")
                .status(HubJobStatus.QUEUED)
                .build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO")).thenReturn(Optional.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);

        HubJobBatchResponse response = service.createBatchJobs(
                "admin",
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
     * 완료된 SUCCESS Job을 다시 요청하면 기존 Job을 QUEUED로 초기화하고 Outbox 이벤트를 발행하는지 검증한다.
     */
    @Test
    void createBatchJobsResetsCompletedJobAndPublishesOutboxEvent() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "GODO_20260618_20260618_admin";
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
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO")).thenReturn(Optional.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);
        when(hubJobMapper.updateStatusToReset(eq(requestKey), any(String.class))).thenReturn(1);

        HubJobBatchResponse response = service.createBatchJobs(
                "admin",
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
                .containsEntry("triggerType", "MANUAL");
        assertThat(response.jobs()).hasSize(1);
        assertThat(response.jobs().get(0).requestId()).isEqualTo("completed-request-id");
        assertThat(response.jobs().get(0).status()).isEqualTo(HubJobStatus.QUEUED.name());
    }

    /**
     * 완료 Job 초기화가 실패(rowCount 0)하면 Outbox 이벤트를 발행하지 않고 예외 처리하는지 검증한다.
     */
    @Test
    void createBatchJobsDoesNotPublishWhenCompletedJobResetIsSkipped() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        String requestKey = "GODO_20260618_20260618_admin";
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
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO")).thenReturn(Optional.of(activeChannel()));
        when(hubJobMapper.selectByRequestKey(requestKey)).thenReturn(existingJob);
        when(hubJobMapper.updateStatusToReset(eq(requestKey), any(String.class))).thenReturn(0);

        assertThatThrownBy(() -> service.createBatchJobs(
                "admin",
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        ))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Job reset skipped because current status is not completed");

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * 비활성 채널이면 Job 조회/생성/Outbox 발행 없이 예외 처리하는지 검증한다.
     */
    @Test
    void createBatchJobsThrowsWhenChannelIsNotActive() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByUserIdAndMallKey(1L, "GODO")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createBatchJobs(
                "admin",
                new HubJobBatchRequest("20260618", "20260618", List.of("GODO"))
        ))
                .isInstanceOf(com.bizbee.hub.channel.ChannelNotFoundException.class)
                .hasMessage("GODO channel is not active");

        verify(hubJobMapper, never()).selectByRequestKey(any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * FAILED 상태의 Job을 재시도할 때 Job을 초기화하고 Outbox 이벤트를 다시 발행하는지 검증한다
     */
    @Test
    void retryJobResetsFailedJobAndPublishesOutboxEvent() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        HubJob failedJob = HubJob.builder()
                .requestId("failed-request-id")
                .requestKey("GODO_20260618_20260618_admin")
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload())
                .retryCount(3)
                .build();

        when(hubJobMapper.selectByRequestId("failed-request-id")).thenReturn(failedJob);
        when(userMapper.findById(1L)).thenReturn(Optional.of(user));
        when(hubJobMapper.resetFailedJobForRetry(eq(failedJob.getRequestKey()), any(String.class))).thenReturn(1);

        service.retryJob("failed-request-id");

        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).resetFailedJobForRetry(eq(failedJob.getRequestKey()), any(String.class));
        verify(jobOutboxService).enqueue(eventCaptor.capture());
        assertThat(eventCaptor.getValue().requestId()).isEqualTo("failed-request-id");
        assertThat(eventCaptor.getValue().requestKey()).isEqualTo(failedJob.getRequestKey());
        assertThat(eventCaptor.getValue().payload()).containsEntry("channelCd", "GODO");
    }

    /**
     * FAILED Job 재시도 초기화가 실패(rowCount 0)하면 Outbox 이벤트를 발행하지 않는지 검증한다.
     */
    @Test
    void retryJobRejectsJobThatIsNotFailed() {
        HubJobServiceImpl service = service();
        HubJob processingJob = HubJob.builder()
                .requestId("processing-request-id")
                .requestKey("GODO_20260618_20260618_admin")
                .status(HubJobStatus.PROCESSING)
                .build();

        when(hubJobMapper.selectByRequestId("processing-request-id")).thenReturn(processingJob);

        assertThatThrownBy(() -> service.retryJob("processing-request-id"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Only FAILED jobs can be retried");

        verify(hubJobMapper, never()).resetFailedJobForRetry(any(String.class), any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void retryJobDoesNotPublishWhenResetIsSkipped() {
        HubJobServiceImpl service = service();
        HubUser user = user(1L, "admin");
        HubJob failedJob = HubJob.builder()
                .requestId("failed-request-id")
                .requestKey("GODO_20260618_20260618_admin")
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .channelCd("GODO")
                .status(HubJobStatus.FAILED)
                .payload(payload())
                .retryCount(3)
                .build();

        when(hubJobMapper.selectByRequestId("failed-request-id")).thenReturn(failedJob);
        when(userMapper.findById(1L)).thenReturn(Optional.of(user));
        when(hubJobMapper.resetFailedJobForRetry(eq(failedJob.getRequestKey()), any(String.class))).thenReturn(0);

        assertThatThrownBy(() -> service.retryJob("failed-request-id"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Job retry skipped because current status is not FAILED");

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    private HubJobServiceImpl service() {
        return new HubJobServiceImpl(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                userMapper,
                channelMapper,
                jdbcTemplate
        );
    }

    private ChannelRow activeChannel() {
        return ChannelRow.builder()
                .userId(1L)
                .mallKey("GODO")
                .useYn("Y")
                .build();
    }

    private String payload() {
        return """
                {"userId":1,"mallKey":"GODO","channelCd":"GODO","frDt":"20260618","toDt":"20260618","triggerType":"MANUAL"}
                """;
    }

    private HubUser user(Long id, String username) {
        HubUser user = new HubUser();
        user.setId(id);
        user.setUsername(username);
        return user;
    }
}
