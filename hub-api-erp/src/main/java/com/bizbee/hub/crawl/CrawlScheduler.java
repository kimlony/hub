package com.bizbee.hub.crawl;

import com.bizbee.hub.job.HubJob;
import com.bizbee.hub.job.HubJobEvent;
import com.bizbee.hub.job.HubJobMapper;
import com.bizbee.hub.job.HubJobStatus;
import com.bizbee.hub.outbox.JobOutboxService;
import com.bizbee.hub.port.JobEventPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrawlScheduler {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HHmm");
    private static final String SOURCE_ERP = "HUB";
    private static final String JOB_TYPE = "CRAWL";

    private final HubJobMapper hubJobMapper;
//    private final JobEventPort jobEventPort;
//    OUTBOX 패턴으로 변경하면서 직접 Kafka로 이벤트를 발행하는 대신, Outbox 테이블에 이벤트를 저장하는 방식으로 변경했습니다.
    private final JobOutboxService jobOutboxService;
    private final ObjectMapper objectMapper;

    @Scheduled(fixedDelayString = "${hub.schedule.crawl-dart-ms:300000}")
    public void runDartCrawl() {
        scheduleCrawlJob("DART");
    }

    @Scheduled(fixedDelayString = "${hub.schedule.crawl-rss-ms:120000}")
    public void runRssCrawl() {
        scheduleCrawlJob("NAVER_RSS");
    }

    private void scheduleCrawlJob(String channelCd) {
        try {
            LocalDateTime now = LocalDateTime.now();
            String requestKey = buildRequestKey(channelCd, now);
            HubJob existing = hubJobMapper.selectByRequestKey(requestKey);

            if (existing != null) {
                log.debug(
                        "crawl job schedule skipped: channelCd={}, requestKey={}, status={}",
                        channelCd,
                        requestKey,
                        existing.getStatus()
                );
                return;
            }

            Map<String, Object> payload = buildPayload(channelCd);
            HubJob job = HubJob.builder()
                    .requestId(UUID.randomUUID().toString())
                    .requestKey(requestKey)
                    .jobType(JOB_TYPE)
                    .sourceErp(SOURCE_ERP)
                    .channelCd(channelCd)
                    .status(HubJobStatus.QUEUED)
                    .payload(toJson(payload))
                    .retryCount(0)
                    .createdAt(now)
                    .updatedAt(now)
                    .build();

            hubJobMapper.insertJob(job);
            jobOutboxService.enqueue(new HubJobEvent(
                    job.getRequestId(),
                    SOURCE_ERP,
                    JOB_TYPE,
                    requestKey,
                    payload
            ));

            log.info("crawl job scheduled: channelCd={}, requestKey={}", channelCd, requestKey);
        } catch (Exception exception) {
            log.warn("crawl job schedule failed: channelCd={}", channelCd, exception);
        }
    }

    private String buildRequestKey(String channelCd, LocalDateTime now) {
        String source = "NAVER_RSS".equals(channelCd) ? "RSS" : channelCd;
        return String.join("_", JOB_TYPE, source, now.format(DATE_FORMAT), now.format(TIME_FORMAT));
    }

    private Map<String, Object> buildPayload(String channelCd) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("mallKey", channelCd);
        payload.put("channelCd", channelCd);
        return payload;
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("failed to serialize crawl payload", exception);
        }
    }
}
