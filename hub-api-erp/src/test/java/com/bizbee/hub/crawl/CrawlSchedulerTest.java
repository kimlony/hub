package com.bizbee.hub.crawl;

import com.bizbee.hub.job.HubJob;
import com.bizbee.hub.job.HubJobEvent;
import com.bizbee.hub.job.HubJobMapper;
import com.bizbee.hub.job.HubJobStatus;
import com.bizbee.hub.outbox.JobOutboxService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

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
     * DART 스케줄 실행 시 CRAWL Job을 생성하고 Outbox 이벤트를 발행하는지 검증한다.
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
     * NAVER_RSS 스케줄 실행 시 RSS용 requestKey로 CRAWL Job과 Outbox 이벤트를 생성하는지 검증한다.
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
     * 같은 requestKey의 크롤링 Job이 이미 있으면 중복 Job 생성과 Outbox 발행을 하지 않는지 검증한다.
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
     * 스케줄 처리 중 DB 오류가 발생해도 예외가 밖으로 전파되지 않고 Outbox 발행도 하지 않는지 검증한다.
     */
    @Test
    void doesNotThrowWhenCrawlSchedulingFails() {
        CrawlScheduler scheduler = scheduler();

        when(hubJobMapper.selectByRequestKey(startsWith("CRAWL_DART_"))).thenReturn(null);
        doThrow(new RuntimeException("db insert failed")).when(hubJobMapper).insertJob(any(HubJob.class));

        assertThatCode(scheduler::runDartCrawl).doesNotThrowAnyException();

        verify(jobOutboxService, never()).enqueue(any(HubJobEvent.class));
    }

    private CrawlScheduler scheduler() {
        return new CrawlScheduler(hubJobMapper, jobOutboxService, objectMapper);
    }
}
