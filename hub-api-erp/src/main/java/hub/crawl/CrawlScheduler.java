package hub.crawl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.outbox.service.JobOutboxService;
import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrawlScheduler {

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HHmm");
    private static final String SOURCE_ERP = "HUB";
    private static final String JOB_TYPE = "CRAWL";
    private static final String CONTRACT_VERSION = "1.0";

    private final HubJobMapper hubJobMapper;
//    private final JobEventPort jobEventPort;
//    OUTBOX ??????怨쀬Ŧ ?곌떠??롪퍔???彛?怨댄맋 嶺뚯쉳???Kafka?????繹?筌? ?꾩룇裕됵쭛??濡ル츎 ???? Outbox ???逾??곕뾼?????繹?筌? ???繞③뇡???꾩렮維???怨쀬Ŧ ?곌떠??롪퍔?筌???鍮??
    private final JobOutboxService jobOutboxService;
    private final ObjectMapper objectMapper;
    private final CrawlScheduleControlService crawlScheduleControlService;

    @Scheduled(fixedDelayString = "${hub.schedule.crawl-dart-ms:300000}")
    public void runDartCrawl() {
        if (!crawlScheduleControlService.isEnabled()) {
            log.debug("crawl job schedule skipped because crawl scheduler is disabled: channelCd=DART");
            return;
        }
        scheduleCrawlJob("DART");
    }

    @Scheduled(fixedDelayString = "${hub.schedule.crawl-rss-ms:120000}")
    public void runRssCrawl() {
        if (!crawlScheduleControlService.isEnabled()) {
            log.debug("crawl job schedule skipped because crawl scheduler is disabled: channelCd=NAVER_RSS");
            return;
        }
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
            String correlationId = UUID.randomUUID().toString();
            HubJob job = HubJob.builder()
                    .requestId(UUID.randomUUID().toString())
                    .requestKey(requestKey)
                    .jobType(JOB_TYPE)
                    .sourceErp(SOURCE_ERP)
                    .parentJobId(null)
                    .correlationId(correlationId)
                    .causationId(null)
                    .schemaVersion(CONTRACT_VERSION)
                    .payloadVersion(CONTRACT_VERSION)
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
                    job.getParentJobId(),
                    job.getCorrelationId(),
                    job.getCausationId(),
                    job.getSchemaVersion(),
                    job.getPayloadVersion(),
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
