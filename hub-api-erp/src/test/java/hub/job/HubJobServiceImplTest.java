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
import hub.job.mapper.HubJobMapper;
import hub.job.service.HubJobServiceImpl;
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
     * 揶쏆늿? 雅뚯눖揆??륁춿 ?遺욧퍕??椰꾧퀣????덈뻻????쇰선?遺우뱽 ??     * 餓λ쵎??Job????밴쉐??? ??꾪?Outbox/Kafka 獄쏆뮉六??餓λ쵎???? ??놁몵筌롫똻苑?     * 疫꿸퀣??Job????됱젟?怨몄몵嚥?獄쏆꼹???롫뮉筌왖 ?類ㅼ뵥??롫뮉 ???뮞??     */
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
     * ?醫됲뇣 雅뚯눖揆??륁춿 ?遺욧퍕?癒?퐣 requestKey 疫꿸퀣? 疫꿸퀣??Job????얩?insert揶쎛 ?源껊궗??野껋럩??
     * Outbox ??源?硫? ?類ㅺ맒 ??밴쉐??롫뮉筌왖 ??μ맄 ???뮞?紐껋쨮 野꺜筌앹빜六??щ빍??
     * ??? ???퉸 Job ??밴쉐??Worker 筌ｌ꼶????源??獄쏆뮉六????ｍ뜞 ?怨뚭퍙??롫뮉 ?類ㅺ맒 ?癒?カ??癰귣똻???랁?
     * 餓λ쵎???遺욧퍕 獄쎻뫗堉?嚥≪뮇彛끾??醫됲뇣 ??밴쉐 嚥≪뮇彛??揶쏄낫而????뮞?紐껋쨮 ?브쑬???筌롪퉭踰?筌ｌ꼶????臾믡걹 ?브쑨由곁몴?野꺜筌앹빜六??щ빍??
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
     * ??? QUEUED ?怨밴묶??Job????됱몵筌?餓λ쵎????밴쉐??援???而????곸뵠 疫꿸퀣??Job??獄쏆꼹???롫뮉筌왖 野꺜筌앹빜釉??
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
     * ?袁⑥┷??SUCCESS Job????쇰뻻 ?遺욧퍕??롢늺 疫꿸퀣??Job??QUEUED嚥??λ뜃由?酉釉??Outbox ??源?紐? 獄쏆뮉六??롫뮉筌왖 野꺜筌앹빜釉??
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
     * ?袁⑥┷ Job ?λ뜃由?遺? ??쎈솭(rowCount 0)??롢늺 Outbox ??源?紐? 獄쏆뮉六??? ??꾪???됱뇚 筌ｌ꼶???롫뮉筌왖 野꺜筌앹빜釉??
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
     * ??쑵???筌?쑬瑗????Job 鈺곌퀬????밴쉐/Outbox 獄쏆뮉六???곸뵠 ??됱뇚 筌ｌ꼶???롫뮉筌왖 野꺜筌앹빜釉??
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
                .isInstanceOf(hub.channel.ChannelNotFoundException.class)
                .hasMessage("GODO channel is not active");

        verify(hubJobMapper, never()).selectByRequestKey(any(String.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * FAILED ?怨밴묶??Job??????袁る막 ??Job???λ뜃由?酉釉??Outbox ??源?紐? ??쇰뻻 獄쏆뮉六??롫뮉筌왖 野꺜筌앹빜釉??     */
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
     * FAILED Job ??????λ뜃由?遺? ??쎈솭(rowCount 0)??롢늺 Outbox ??源?紐? 獄쏆뮉六??? ??낅뮉筌왖 野꺜筌앹빜釉??
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
