package hub.crawl;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.outbox.service.JobOutboxService;
import java.util.Map;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrawlSchedulerTest {

    @Mock
    private HubJobMapper hubJobMapper;

    @Mock
    private JobOutboxService jobOutboxService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    /**
     * DART ???餓???쎈뻬 ??CRAWL Job????밴쉐??랁?Outbox ??源?紐? 獄쏆뮉六??롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void schedulesDartCrawlJobAndEnqueuesOutboxEvent() {
        CrawlScheduler scheduler = scheduler();

        when(hubJobMapper.selectByRequestKey(startsWith("CRAWL_DART_"))).thenReturn(null);

        scheduler.runDartCrawl();

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).insertJob(jobCaptor.capture());
        verify(jobOutboxService).enqueue(eventCaptor.capture());

        HubJob job = jobCaptor.getValue();
        assertThat(job.getRequestId()).isNotBlank();
        assertThat(job.getRequestKey()).startsWith("CRAWL_DART_");
        assertThat(job.getJobType()).isEqualTo("CRAWL");
        assertThat(job.getSourceErp()).isEqualTo("HUB");
        assertThat(job.getChannelCd()).isEqualTo("DART");
        assertThat(job.getStatus()).isEqualTo(HubJobStatus.QUEUED);
        assertThat(job.getRetryCount()).isZero();
        assertThat(job.getPayload()).contains("\"mallKey\":\"DART\"");

        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo(job.getRequestId());
        assertThat(event.jobType()).isEqualTo("CRAWL");
        assertThat(event.requestKey()).isEqualTo(job.getRequestKey());
        assertThat(event.payload()).containsEntry("mallKey", "DART");
        assertThat(event.payload()).containsEntry("channelCd", "DART");
    }

    /**
     * NAVER_RSS ???餓???쎈뻬 ??RSS??requestKey嚥?CRAWL Job??Outbox ??源?紐? ??밴쉐??롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void schedulesRssCrawlJobWithRssRequestKeyAndEnqueuesOutboxEvent() {
        CrawlScheduler scheduler = scheduler();

        when(hubJobMapper.selectByRequestKey(startsWith("CRAWL_RSS_"))).thenReturn(null);

        scheduler.runRssCrawl();

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(hubJobMapper).insertJob(jobCaptor.capture());
        verify(jobOutboxService).enqueue(eventCaptor.capture());

        HubJob job = jobCaptor.getValue();
        assertThat(job.getRequestKey()).startsWith("CRAWL_RSS_");
        assertThat(job.getChannelCd()).isEqualTo("NAVER_RSS");
        assertThat(job.getStatus()).isEqualTo(HubJobStatus.QUEUED);
        assertThat(job.getPayload()).contains("\"channelCd\":\"NAVER_RSS\"");

        HubJobEvent event = eventCaptor.getValue();
        assertThat(event.requestId()).isEqualTo(job.getRequestId());
        assertThat(event.payload()).containsEntry("mallKey", "NAVER_RSS");
        assertThat(event.payload()).containsEntry("channelCd", "NAVER_RSS");
    }

    /**
     * 揶쏆늿? requestKey????쨌筌?Job????? ??됱몵筌?餓λ쵎??Job ??밴쉐??Outbox 獄쏆뮉六????? ??낅뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void skipsCrawlJobWhenRequestKeyAlreadyExists() {
        CrawlScheduler scheduler = scheduler();
        HubJob existingJob = HubJob.builder()
                .requestId("existing-request-id")
                .requestKey("CRAWL_DART_20260618_1200")
                .status(HubJobStatus.QUEUED)
                .build();

        when(hubJobMapper.selectByRequestKey(startsWith("CRAWL_DART_"))).thenReturn(existingJob);

        scheduler.runDartCrawl();

        verify(hubJobMapper, never()).insertJob(any(HubJob.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    /**
     * ???餓?筌ｌ꼶??餓?DB ??살첒揶쎛 獄쏆뮇源??猷???됱뇚揶쎛 獄쏅쉼?앮에??袁る솁??? ??꾪?Outbox 獄쏆뮉六????? ??낅뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void doesNotThrowWhenCrawlSchedulingFails() {
        CrawlScheduler scheduler = scheduler();

        when(hubJobMapper.selectByRequestKey(startsWith("CRAWL_DART_"))).thenReturn(null);
        doThrow(new RuntimeException("db insert failed")).when(hubJobMapper).insertJob(any(HubJob.class));

        assertThatCode(scheduler::runDartCrawl).doesNotThrowAnyException();

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    @Test
    void skipsCrawlJobWhenSchedulerIsDisabled() {
        CrawlScheduler scheduler = new CrawlScheduler(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                new CrawlScheduleControlService(false)
        );

        scheduler.runDartCrawl();

        verify(hubJobMapper, never()).insertJob(any(HubJob.class));
        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    private CrawlScheduler scheduler() {
        return new CrawlScheduler(
                hubJobMapper,
                jobOutboxService,
                objectMapper,
                new CrawlScheduleControlService(true)
        );
    }
}
