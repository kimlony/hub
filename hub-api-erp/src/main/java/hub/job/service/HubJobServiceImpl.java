package hub.job.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelNotFoundException;
import hub.channel.domain.ChannelRow;
import hub.channel.mapper.ChannelMapper;
import hub.exception.HubJobNotFoundException;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubDashboardResponse;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.dto.response.HubJobDetailResponse;
import hub.job.dto.response.HubJobListItem;
import hub.job.dto.response.HubJobListResponse;
import hub.job.dto.response.HubJobLogResponse;
import hub.job.dto.response.JobPerformancePoint;
import hub.job.dto.response.JobPerformanceResponse;
import hub.job.dto.response.JobPerformanceSummary;
import hub.job.dto.response.LoadTestRunItem;
import hub.job.dto.response.WorkerPerformanceItem;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.outbox.service.JobOutboxService;
import hub.port.JobEventPort;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

//import hub.port.JobEventPort;


@Service
@RequiredArgsConstructor
@Transactional
public class HubJobServiceImpl implements HubJobService {

    private final HubJobMapper hubJobMapper;
//    private final JobEventPort jobEventPort;
//    OUTBOX ??????怨쀬Ŧ ?곌떠??롪퍔???彛?怨댄맋 嶺뚯쉳???Kafka?????繹?筌? ?꾩룇裕됵쭛??濡ル츎 ???? Outbox ???逾??곕뾼?????繹?筌? ???繞③뇡???꾩렮維???怨쀬Ŧ ?곌떠??롪퍔?筌???鍮??
    private final JobOutboxService jobOutboxService;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;
    private final ChannelMapper channelMapper;
    private final JdbcTemplate jdbcTemplate;
    private final JobPayloadValidator jobPayloadValidator;

    @Override
    public HubJobBatchResponse createBatchJobs(String username, HubJobBatchRequest request) {
        HubUser user = findUserByUsername(username);

        List<HubJobBatchResponse.JobResult> jobs = resolveChannelAccounts(user, request)
                .stream()
                .map(account -> createBatchJob(user, account, request, TriggerType.MANUAL, null))
                .collect(Collectors.toList());

        return new HubJobBatchResponse(jobs);
    }

    @Override
    public HubJobBatchResponse createScheduledBatchJobs(String username, Long scheduleRunId, HubJobBatchRequest request) {
        HubUser user = findUserByUsername(username);

        List<HubJobBatchResponse.JobResult> jobs = resolveChannelAccounts(user, request)
                .stream()
                .map(account -> createBatchJob(user, account, request, TriggerType.SCHEDULE, scheduleRunId))
                .collect(Collectors.toList());

        return new HubJobBatchResponse(jobs);
    }

    @Transactional(readOnly = true)
    @Override
    public HubJobDetailResponse getJob(String requestId) {
        HubJob job = hubJobMapper.selectByRequestId(requestId);
        if (job == null) {
            throw new HubJobNotFoundException(requestId);
        }
        return toDetailResponse(job);
    }

    private HubJobBatchResponse.JobResult createBatchJob(
            HubUser user,
            ChannelRow account,
            HubJobBatchRequest request,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        String mallKey = account.getMallKey();

        String requestKey = buildRequestKey(account, request, triggerType, scheduleRunId);
        HubJob existing = hubJobMapper.selectByRequestKey(requestKey);

        String requestId;
        String status;

        if (existing == null) {
            HubJob newJob = buildNewJob(requestKey, account, request, user, triggerType, scheduleRunId);

            // requestKey unique index makes concurrent duplicate requests idempotent.
            int inserted = hubJobMapper.insertJobIfAbsent(newJob);

            if (inserted == 1) {
                publishEvent(newJob);
                requestId = newJob.getRequestId();
                status = newJob.getStatus().name();
            } else {
                HubJob duplicated = hubJobMapper.selectByRequestKey(requestKey);
                if (duplicated == null) {
                    throw new IllegalStateException("Duplicated job was not found after insert conflict");
                }
                requestId = duplicated.getRequestId();
                status = duplicated.getStatus().name();
            }

        } else if (existing.getStatus() == HubJobStatus.QUEUED
                || existing.getStatus() == HubJobStatus.PROCESSING) {
            requestId = existing.getRequestId();
            status = existing.getStatus().name();
        } else {
            String latestPayload = serializePayload(account, request, user, triggerType, scheduleRunId);
            existing.setPayload(latestPayload);
            existing.setStatus(HubJobStatus.QUEUED);
            int updated = hubJobMapper.updateStatusToReset(requestKey, latestPayload);
            if(updated != 1){
                throw new IllegalStateException("Job reset skipped because current status is not completed");
            }
            publishEvent(existing);
            requestId = existing.getRequestId();
            status = HubJobStatus.QUEUED.name();
        }

        return new HubJobBatchResponse.JobResult(requestId, mallKey, status);
    }

    private HubJob buildNewJob(
            String requestKey,
            ChannelRow account,
            HubJobBatchRequest request,
            HubUser user,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        return HubJob.builder()
                .requestId(UUID.randomUUID().toString())
                .requestKey(requestKey)
                .jobType("ORDER_COLLECT")
                .sourceErp("HUB")
                .parentJobId(null)
                .correlationId(UUID.randomUUID().toString())
                .causationId(null)
                .schemaVersion("1.0")
                .payloadVersion("1.0")
                .channelCd(account.getMallKey())
                .status(HubJobStatus.QUEUED)
                .payload(serializePayload(account, request, user, triggerType, scheduleRunId))
                .retryCount(0)
                .build();
    }

    private String buildRequestKey(
            ChannelRow account,
            HubJobBatchRequest request,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        String mallKey = account.getMallKey();
        String accountId = String.valueOf(account.getId());
        if (triggerType == TriggerType.SCHEDULE) {
            if (scheduleRunId == null) {
                throw new IllegalArgumentException("scheduleRunId is required for scheduled job");
            }
            return String.join("_",
                    "SCHEDULE",
                    String.valueOf(scheduleRunId),
                    accountId,
                    mallKey,
                    request.frDt(),
                    request.toDt()
            );
        }
        if (isMockMall(mallKey) && request.mockPage() != null) {
            return String.join("_",
                    nullToDefault(request.loadTestRunId(), "MOCK_MALL"),
                    accountId,
                    mallKey,
                    String.valueOf(request.mockPage()),
                    request.frDt(),
                    request.toDt()
            );
        }
        return String.join("_", accountId, mallKey, request.frDt(), request.toDt());
    }

    private String serializePayload(
            ChannelRow account,
            HubJobBatchRequest request,
            HubUser user,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", user.getId());
        payload.put("corpId", user.getCorpId());
        payload.put("channelAccountId", account.getId());
        String mallKey = account.getMallKey();
        payload.put("mallKey", mallKey);
        payload.put("channelCd", mallKey);
        payload.put("frDt", request.frDt());
        payload.put("toDt", request.toDt());
        payload.put("triggerType", triggerType.name());
        if (isMockMall(mallKey)) {
            putIfNotNull(payload, "page", request.mockPage());
            putIfNotNull(payload, "size", request.mockSize());
            putIfNotNull(payload, "totalCount", request.mockTotalCount());
            putIfNotBlank(payload, "seed", request.mockSeed());
            putIfNotNull(payload, "delayMs", request.mockDelayMs());
            putIfNotNull(payload, "errorRate", request.mockErrorRate());
            putIfNotNull(payload, "timeoutRate", request.mockTimeoutRate());
            putIfNotBlank(payload, "runId", request.loadTestRunId());
            putIfNotBlank(payload, "scenario", request.scenario());
        }
        if (scheduleRunId != null) {
            payload.put("scheduleRunId", scheduleRunId);
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize payload", e);
        }
    }

    private List<ChannelRow> resolveChannelAccounts(HubUser user, HubJobBatchRequest request) {
        Map<Long, ChannelRow> resolved = new LinkedHashMap<>();

        if (request.channelAccountIds() != null) {
            request.channelAccountIds().forEach(channelAccountId -> {
                ChannelRow account = channelMapper.findActiveByCorpIdAndId(user.getCorpId(), channelAccountId)
                        .orElseThrow(() -> new ChannelNotFoundException(
                                "channel account is not active: " + channelAccountId));
                resolved.put(account.getId(), account);
            });
        }

        if (request.mallKeys() != null) {
            request.mallKeys().forEach(mallKey -> {
                if (isMockMall(mallKey)) {
                    ChannelRow account = ensureMockChannelAccount(user);
                    resolved.put(account.getId(), account);
                    return;
                }
                List<ChannelRow> accounts = channelMapper.findActiveByCorpIdAndMallKey(user.getCorpId(), mallKey);
                if (accounts.isEmpty()) {
                    throw new ChannelNotFoundException(mallKey + " channel has no active account");
                }
                accounts.forEach(account -> resolved.put(account.getId(), account));
            });
        }

        if (resolved.isEmpty()) {
            throw new IllegalArgumentException("mallKeys or channelAccountIds must not be empty");
        }
        return new ArrayList<>(resolved.values());
    }

    private ChannelRow ensureMockChannelAccount(HubUser user) {
        return channelMapper.findAnyByCorpIdAndMallKey(user.getCorpId(), "MOCK_MALL")
                .orElseGet(() -> {
                    ChannelRow account = ChannelRow.builder()
                            .corpId(user.getCorpId())
                            .userId(user.getId())
                            .mallKey("MOCK_MALL")
                            .accountName("Mock Mall")
                            .useYn("Y")
                            .build();
                    channelMapper.insert(account);
                    return account;
                });
    }

    private void publishEvent(HubJob job) {
        publishEvent(job, null);
    }

    private void publishEvent(HubJob job, String partitionKey) {
        Map<String, Object> payloadMap = jobPayloadValidator.validate(job);
        HubJobEvent event = new HubJobEvent(
                job.getRequestId(),
                job.getSourceErp(),
                job.getJobType(),
                job.getRequestKey(),
                job.getParentJobId(),
                job.getCorrelationId(),
                job.getCausationId(),
                job.getSchemaVersion(),
                job.getPayloadVersion(),
                payloadMap
        );
        if (partitionKey == null || partitionKey.isBlank()) {
            jobOutboxService.enqueue(event);
        } else {
            jobOutboxService.enqueue(event, partitionKey);
        }
    }

    @Transactional(readOnly = true)
    @Override
    public HubJobListResponse getJobs(String status, String channelCd, int page, int size) {
        int offset = (page - 1) * size;
        String statusParam = (status == null || status.isBlank()) ? null : status;
        String channelParam = (channelCd == null || channelCd.isBlank()) ? null : channelCd;

        List<HubJob> jobs = hubJobMapper.selectJobList(statusParam, channelParam, size, offset);
        int total = hubJobMapper.selectJobListCount(statusParam, channelParam);

        List<HubJobListItem> items = jobs.stream()
                .map(this::toListItem)
                .collect(Collectors.toList());

        return new HubJobListResponse(items, total, page, size);
    }

    @Transactional(readOnly = true)
    @Override
    public HubDashboardResponse getDashboard() {
        return new HubDashboardResponse(
                hubJobMapper.selectDashboardStats(),
                hubJobMapper.selectDashboardRecentJobs(8),
                hubJobMapper.selectDashboardChannelStats(),
                buildPerformanceResponse(60),
                selectWorkerPerformance(60),
                selectRecentLoadTestRuns(8),
                LocalDateTime.now()
        );
    }

    @Transactional(readOnly = true)
    @Override
    public JobPerformanceResponse getPerformance(int minutes) {
        int safeMinutes = Math.max(1, Math.min(minutes, 24 * 60));
        return buildPerformanceResponse(safeMinutes);
    }

    private JobPerformanceResponse buildPerformanceResponse(int safeMinutes) {
        return new JobPerformanceResponse(
                safeMinutes,
                selectPerformanceSummary(safeMinutes),
                selectPerformancePoints(safeMinutes),
                LocalDateTime.now()
        );
    }

    @Transactional(readOnly = true)
    @Override
    public HubJobLogResponse getJobLogs(String requestId) {
        HubJob job = hubJobMapper.selectByRequestId(requestId);
        if (job == null) {
            throw new HubJobNotFoundException(requestId);
        }
        return new HubJobLogResponse(requestId, hubJobMapper.selectJobLogs(requestId));
    }

    @Override
    public void retryJob(String requestId) {
        HubJob job = hubJobMapper.selectByRequestId(requestId);
        if (job == null) {
            throw new HubJobNotFoundException(requestId);
        }
        if (job.getStatus() != HubJobStatus.FAILED) {
            throw new IllegalStateException("Only FAILED jobs can be retried");
        }
        jobPayloadValidator.validate(job);
        String originalPayload = job.getPayload();
        String partitionKey = jobOutboxService.findLatestPartitionKey(job.getRequestId());
        job.setStatus(HubJobStatus.QUEUED);
        int updated = hubJobMapper.resetFailedJobForRetry(job.getRequestKey(), originalPayload);
        if (updated != 1) {
            throw new IllegalStateException("Job retry skipped because current status is not FAILED");
        }
        publishEvent(job, partitionKey);
    }

    private JobPerformanceSummary selectPerformanceSummary(int minutes) {
        return jdbcTemplate.queryForObject(
                """
                        WITH target AS (
                            SELECT
                                status,
                                created_at,
                                CASE
                                    WHEN completed_at IS NOT NULL THEN completed_at
                                    WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                    ELSE NULL
                                END AS finished_at,
                                EXTRACT(EPOCH FROM (
                                    CASE
                                        WHEN completed_at IS NOT NULL THEN completed_at
                                        WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                        ELSE NULL
                                    END - created_at
                                )) * 1000 AS duration_ms
                            FROM hub_job
                            WHERE created_at >= NOW() - (? * INTERVAL '1 minute')
                        )
                        SELECT
                            COUNT(*)::bigint AS total_jobs,
                            COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::bigint AS completed_jobs,
                            COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS success_jobs,
                            COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed_jobs,
                            COALESCE(AVG(duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS avg_duration_ms,
                            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS p50_duration_ms,
                            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS p95_duration_ms,
                            COALESCE(MAX(duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS max_duration_ms
                        FROM target
                        """,
                (rs, rowNum) -> new JobPerformanceSummary(
                        rs.getLong("total_jobs"),
                        rs.getLong("completed_jobs"),
                        rs.getLong("success_jobs"),
                        rs.getLong("failed_jobs"),
                        roundDouble(rs.getDouble("avg_duration_ms")),
                        roundDouble(rs.getDouble("p50_duration_ms")),
                        roundDouble(rs.getDouble("p95_duration_ms")),
                        roundDouble(rs.getDouble("max_duration_ms")),
                        roundDouble(rs.getLong("completed_jobs") / (double) minutes)
                ),
                minutes
        );
    }

    private List<JobPerformancePoint> selectPerformancePoints(int minutes) {
        int bucketMinutes = minutes <= 60 ? 5 : 15;
        return jdbcTemplate.query(
                """
                        WITH target AS (
                            SELECT
                                status,
                                CASE
                                    WHEN completed_at IS NOT NULL THEN completed_at
                                    WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                    ELSE NULL
                                END AS finished_at,
                                EXTRACT(EPOCH FROM (
                                    CASE
                                        WHEN completed_at IS NOT NULL THEN completed_at
                                        WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                        ELSE NULL
                                    END - created_at
                                )) * 1000 AS duration_ms,
                                date_trunc('hour', created_at AT TIME ZONE 'Asia/Seoul')
                                    + FLOOR(EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Seoul') / ?) * (? * INTERVAL '1 minute')
                                    AS bucket_at
                            FROM hub_job
                            WHERE created_at >= NOW() - (? * INTERVAL '1 minute')
                        )
                        SELECT
                            to_char(bucket_at, 'HH24:MI') AS bucket,
                            COUNT(*)::bigint AS total_jobs,
                            COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::bigint AS completed_jobs,
                            COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS success_jobs,
                            COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed_jobs,
                            COALESCE(AVG(duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS avg_duration_ms,
                            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE finished_at IS NOT NULL), 0)::float8 AS p95_duration_ms
                        FROM target
                        GROUP BY bucket_at
                        ORDER BY bucket_at ASC
                        """,
                (rs, rowNum) -> new JobPerformancePoint(
                        rs.getString("bucket"),
                        rs.getLong("total_jobs"),
                        rs.getLong("completed_jobs"),
                        rs.getLong("success_jobs"),
                        rs.getLong("failed_jobs"),
                        roundDouble(rs.getDouble("avg_duration_ms")),
                        roundDouble(rs.getDouble("p95_duration_ms"))
                ),
                bucketMinutes,
                bucketMinutes,
                minutes
        );
    }

    private List<LoadTestRunItem> selectRecentLoadTestRuns(int limit) {
        Boolean tableExists = jdbcTemplate.queryForObject(
                "SELECT to_regclass('public.hub_load_test_run') IS NOT NULL",
                Boolean.class
        );
        if (!Boolean.TRUE.equals(tableExists)) {
            return List.of();
        }

        return jdbcTemplate.query(
                """
                        SELECT
                            id,
                            run_id,
                            mode,
                            total_requested,
                            total_jobs,
                            completed_jobs,
                            success_jobs,
                            failed_jobs,
                            elapsed_ms,
                            throughput_per_minute,
                            avg_duration_ms,
                            p50_duration_ms,
                            p95_duration_ms,
                            max_duration_ms,
                            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at
                        FROM hub_load_test_run
                        ORDER BY created_at DESC, id DESC
                        LIMIT ?
                        """,
                (rs, rowNum) -> new LoadTestRunItem(
                        rs.getLong("id"),
                        rs.getString("run_id"),
                        rs.getString("mode"),
                        rs.getInt("total_requested"),
                        rs.getInt("total_jobs"),
                        rs.getInt("completed_jobs"),
                        rs.getInt("success_jobs"),
                        rs.getInt("failed_jobs"),
                        rs.getLong("elapsed_ms"),
                        roundDouble(rs.getDouble("throughput_per_minute")),
                        roundDouble(rs.getDouble("avg_duration_ms")),
                        roundDouble(rs.getDouble("p50_duration_ms")),
                        roundDouble(rs.getDouble("p95_duration_ms")),
                        roundDouble(rs.getDouble("max_duration_ms")),
                        rs.getString("created_at")
                ),
                Math.max(1, Math.min(limit, 20))
        );
    }

    private List<WorkerPerformanceItem> selectWorkerPerformance(int minutes) {
        return jdbcTemplate.query(
                """
                        WITH completed AS (
                            SELECT
                                request_id,
                                status,
                                created_at,
                                CASE
                                    WHEN completed_at IS NOT NULL THEN completed_at
                                    WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                    ELSE NULL
                                END AS finished_at,
                                EXTRACT(EPOCH FROM (
                                    CASE
                                        WHEN completed_at IS NOT NULL THEN completed_at
                                        WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
                                        ELSE NULL
                                    END - created_at
                                )) * 1000 AS duration_ms
                            FROM hub_job
                            WHERE created_at >= NOW() - (? * INTERVAL '1 minute')
                              AND status IN ('SUCCESS', 'FAILED')
                        ),
                        assigned AS (
                            SELECT DISTINCT ON (request_id)
                                request_id,
                                NULLIF(detail ->> 'workerInstanceId', '') AS worker_instance_id,
                                NULLIF(detail ->> 'kafkaClientId', '') AS kafka_client_id,
                                NULLIF(detail ->> 'source', '') AS source
                            FROM hub_job_log
                            WHERE event_type IN ('JOB_RECEIVED_FROM_KAFKA', 'JOB_RECEIVED_FROM_RECOVERY')
                              AND created_at >= NOW() - (? * INTERVAL '1 minute')
                            ORDER BY request_id, created_at DESC, id DESC
                        )
                        SELECT
                            COALESCE(assigned.worker_instance_id, 'unknown') AS worker_instance_id,
                            COALESCE(assigned.kafka_client_id, '') AS kafka_client_id,
                            COALESCE(assigned.source, 'unknown') AS source,
                            COUNT(*)::bigint AS completed_jobs,
                            COUNT(*) FILTER (WHERE completed.status = 'SUCCESS')::bigint AS success_jobs,
                            COUNT(*) FILTER (WHERE completed.status = 'FAILED')::bigint AS failed_jobs,
                            COALESCE(AVG(completed.duration_ms), 0)::float8 AS avg_duration_ms,
                            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY completed.duration_ms), 0)::float8 AS p95_duration_ms,
                            COALESCE(MAX(completed.duration_ms), 0)::float8 AS max_duration_ms,
                            to_char(MAX(completed.finished_at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS last_completed_at
                        FROM completed
                        LEFT JOIN assigned ON assigned.request_id = completed.request_id
                        WHERE completed.finished_at IS NOT NULL
                        GROUP BY
                            COALESCE(assigned.worker_instance_id, 'unknown'),
                            COALESCE(assigned.kafka_client_id, ''),
                            COALESCE(assigned.source, 'unknown')
                        ORDER BY completed_jobs DESC, worker_instance_id ASC
                        """,
                (rs, rowNum) -> new WorkerPerformanceItem(
                        rs.getString("worker_instance_id"),
                        rs.getString("kafka_client_id"),
                        rs.getString("source"),
                        rs.getLong("completed_jobs"),
                        rs.getLong("success_jobs"),
                        rs.getLong("failed_jobs"),
                        roundDouble(rs.getDouble("avg_duration_ms")),
                        roundDouble(rs.getDouble("p95_duration_ms")),
                        roundDouble(rs.getDouble("max_duration_ms")),
                        roundDouble(rs.getLong("completed_jobs") / (double) minutes),
                        rs.getString("last_completed_at")
                ),
                minutes,
                minutes + 60
        );
    }

    private Double roundDouble(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private HubJobListItem toListItem(HubJob job) {
        Map<String, Object> payloadMap = parsePayloadQuietly(job.getPayload());
        String frDt = payloadMap.get("frDt") instanceof String text ? text : "";
        String toDt = payloadMap.get("toDt") instanceof String text ? text : "";
        String createdAt = job.getCreatedAt() != null ? job.getCreatedAt().toString() : "";
        return new HubJobListItem(
                job.getRequestId(),
                job.getChannelCd(),
                frDt,
                toDt,
                job.getStatus().name(),
                job.getRetryCount(),
                job.getErrorMessage(),
                createdAt
        );
    }

    private HubJobDetailResponse toDetailResponse(HubJob job) {
        return new HubJobDetailResponse(
                job.getRequestId(),
                job.getRequestKey(),
                job.getChannelCd(),
                job.getStatus().name(),
                job.getRetryCount(),
                job.getErrorMessage(),
                job.getCreatedAt(),
                job.getUpdatedAt()
        );
    }

    private HubUser findUserByUsername(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("user not found"));
    }

    private Map<String, Object> parsePayloadQuietly(String payload) {
        if (payload == null || payload.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(payload, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    private boolean isMockMall(String mallKey) {
        return "MOCK_MALL".equals(mallKey);
    }

    private void putIfNotNull(Map<String, Object> payload, String key, Object value) {
        if (value != null) {
            payload.put(key, value);
        }
    }

    private void putIfNotBlank(Map<String, Object> payload, String key, String value) {
        if (value != null && !value.isBlank()) {
            payload.put(key, value);
        }
    }

    private String nullToDefault(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private enum TriggerType {
        MANUAL,
        SCHEDULE
    }
}
