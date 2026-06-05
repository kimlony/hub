package com.bizbee.hub.job;

import com.bizbee.hub.auth.AuthException;
import com.bizbee.hub.auth.HubUser;
import com.bizbee.hub.auth.UserMapper;
import com.bizbee.hub.channel.ChannelMapper;
import com.bizbee.hub.channel.ChannelNotFoundException;
import com.bizbee.hub.exception.HubJobNotFoundException;
import com.bizbee.hub.port.JobEventPort;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class HubJobServiceImpl implements HubJobService {

    private final HubJobMapper hubJobMapper;
    private final JobEventPort jobEventPort;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;
    private final ChannelMapper channelMapper;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public HubJobBatchResponse createBatchJobs(String username, HubJobBatchRequest request) {
        HubUser user = findUserByUsername(username);

        List<HubJobBatchResponse.JobResult> jobs = request.mallKeys()
                .stream()
                .map(mallKey -> createBatchJob(user, mallKey, request, TriggerType.MANUAL, null))
                .collect(Collectors.toList());

        return new HubJobBatchResponse(jobs);
    }

    @Override
    public HubJobBatchResponse createScheduledBatchJobs(String username, Long scheduleRunId, HubJobBatchRequest request) {
        HubUser user = findUserByUsername(username);

        List<HubJobBatchResponse.JobResult> jobs = request.mallKeys()
                .stream()
                .map(mallKey -> createBatchJob(user, mallKey, request, TriggerType.SCHEDULE, scheduleRunId))
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
            String mallKey,
            HubJobBatchRequest request,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        channelMapper.findActiveByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " channel is not active"));

        String requestKey = buildRequestKey(mallKey, request, user, triggerType, scheduleRunId);
        HubJob existing = hubJobMapper.selectByRequestKey(requestKey);

        String requestId;
        String status;

        if (existing == null) {
            HubJob newJob = buildNewJob(requestKey, mallKey, request, user, triggerType, scheduleRunId);
            hubJobMapper.insertJob(newJob);
            publishEvent(newJob);
            requestId = newJob.getRequestId();
            status = newJob.getStatus().name();
        } else if (existing.getStatus() == HubJobStatus.QUEUED
                || existing.getStatus() == HubJobStatus.PROCESSING) {
            requestId = existing.getRequestId();
            status = existing.getStatus().name();
        } else {
            String latestPayload = serializePayload(mallKey, request, user, triggerType, scheduleRunId);
            existing.setPayload(latestPayload);
            existing.setStatus(HubJobStatus.QUEUED);
            hubJobMapper.updateStatusToReset(requestKey, latestPayload);
            publishEvent(existing);
            requestId = existing.getRequestId();
            status = HubJobStatus.QUEUED.name();
        }

        return new HubJobBatchResponse.JobResult(requestId, mallKey, status);
    }

    private HubJob buildNewJob(
            String requestKey,
            String mallKey,
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
                .channelCd(mallKey)
                .status(HubJobStatus.QUEUED)
                .payload(serializePayload(mallKey, request, user, triggerType, scheduleRunId))
                .retryCount(0)
                .build();
    }

    private String buildRequestKey(
            String mallKey,
            HubJobBatchRequest request,
            HubUser user,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        if (triggerType == TriggerType.SCHEDULE) {
            if (scheduleRunId == null) {
                throw new IllegalArgumentException("scheduleRunId is required for scheduled job");
            }
            return String.join("_",
                    "SCHEDULE",
                    String.valueOf(scheduleRunId),
                    mallKey,
                    request.frDt(),
                    request.toDt(),
                    user.getUsername()
            );
        }
        return String.join("_", mallKey, request.frDt(), request.toDt(), user.getUsername());
    }

    private String serializePayload(
            String mallKey,
            HubJobBatchRequest request,
            HubUser user,
            TriggerType triggerType,
            Long scheduleRunId
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", user.getId());
        payload.put("mallKey", mallKey);
        payload.put("channelCd", mallKey);
        payload.put("frDt", request.frDt());
        payload.put("toDt", request.toDt());
        payload.put("triggerType", triggerType.name());
        if (scheduleRunId != null) {
            payload.put("scheduleRunId", scheduleRunId);
        }
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize payload", e);
        }
    }

    private void publishEvent(HubJob job) {
        try {
            Map<String, Object> payloadMap = objectMapper.readValue(
                    job.getPayload(), new TypeReference<Map<String, Object>>() {});
            payloadMap.put("channelCd", job.getChannelCd());

            jobEventPort.publish(new HubJobEvent(
                    job.getRequestId(),
                    "HUB",
                    "ORDER_COLLECT",
                    job.getRequestKey(),
                    payloadMap
            ));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to parse payload for Kafka event", e);
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
        String latestPayload = rebuildPayloadForRetry(job);
        job.setPayload(latestPayload);
        job.setStatus(HubJobStatus.QUEUED);
        hubJobMapper.updateStatusToReset(job.getRequestKey(), latestPayload);
        publishEvent(job);
    }

    private String rebuildPayloadForRetry(HubJob job) {
        try {
            Map<String, Object> payloadMap = objectMapper.readValue(
                    job.getPayload(), new TypeReference<Map<String, Object>>() {});
            Long userId = toLong(payloadMap.get("userId"));
            String mallKey = requireString(payloadMap.get("mallKey"), "mallKey");
            String frDt = requireString(payloadMap.get("frDt"), "frDt");
            String toDt = requireString(payloadMap.get("toDt"), "toDt");
            TriggerType triggerType = TriggerType.valueOf(
                    String.valueOf(payloadMap.getOrDefault("triggerType", TriggerType.MANUAL.name())));
            Long scheduleRunId = payloadMap.containsKey("scheduleRunId")
                    ? toLong(payloadMap.get("scheduleRunId"))
                    : null;

            HubUser user = userMapper.findById(userId)
                    .orElseThrow(() -> new AuthException("user not found"));
            return serializePayload(
                    mallKey,
                    new HubJobBatchRequest(frDt, toDt, List.of(mallKey)),
                    user,
                    triggerType,
                    scheduleRunId
            );
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to parse payload for retry", e);
        }
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

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text);
        }
        throw new IllegalArgumentException("Invalid numeric value: " + value);
    }

    private String requireString(Object value, String fieldName) {
        if (value instanceof String text && !text.isBlank()) {
            return text;
        }
        throw new IllegalArgumentException(fieldName + " is required");
    }

    private enum TriggerType {
        MANUAL,
        SCHEDULE
    }
}
