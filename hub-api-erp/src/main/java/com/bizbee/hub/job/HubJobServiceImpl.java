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

    private final HubJobMapper  hubJobMapper;
    private final JobEventPort  jobEventPort;
    private final ObjectMapper  objectMapper;
    private final UserMapper    userMapper;
    private final ChannelMapper channelMapper;

    @Override
    public HubJobBatchResponse createBatchJobs(String username, HubJobBatchRequest request) {
        HubUser user = userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("사용자를 찾을 수 없습니다."));

        List<HubJobBatchResponse.JobResult> jobs = request.mallKeys()
                .stream()
                .map(mallKey -> createBatchJob(user, mallKey, request))
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
            HubJobBatchRequest request
    ) {
        channelMapper.findActiveByUserIdAndMallKey(user.getId(), mallKey)
                .orElseThrow(() -> new ChannelNotFoundException(mallKey + " 채널이 등록되지 않았습니다."));

        String requestKey = String.join("_", mallKey, request.frDt(), request.toDt(), user.getUsername());
        HubJob existing   = hubJobMapper.selectByRequestKey(requestKey);

        String requestId;
        String status;

        if (existing == null) {
            HubJob newJob = buildNewJob(requestKey, mallKey, request, user);
            hubJobMapper.insertJob(newJob);
            publishEvent(newJob);
            requestId = newJob.getRequestId();
            status    = newJob.getStatus().name();
        } else if (existing.getStatus() == HubJobStatus.QUEUED
                || existing.getStatus() == HubJobStatus.PROCESSING) {
            requestId = existing.getRequestId();
            status    = existing.getStatus().name();
        } else {
            String latestPayload = serializePayload(mallKey, request, user);
            existing.setPayload(latestPayload);
            existing.setStatus(HubJobStatus.QUEUED);
            hubJobMapper.updateStatusToReset(requestKey, latestPayload);
            publishEvent(existing);
            requestId = existing.getRequestId();
            status    = HubJobStatus.QUEUED.name();
        }

        return new HubJobBatchResponse.JobResult(requestId, mallKey, status);
    }

    private HubJob buildNewJob(
            String requestKey,
            String mallKey,
            HubJobBatchRequest request,
            HubUser user
    ) {
        return HubJob.builder()
                .requestId(UUID.randomUUID().toString())
                .requestKey(requestKey)
                .channelCd(mallKey)
                .status(HubJobStatus.QUEUED)
                .payload(serializePayload(mallKey, request, user))
                .retryCount(0)
                .build();
    }

    private String serializePayload(
            String mallKey,
            HubJobBatchRequest request,
            HubUser user
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId",   user.getId());
        payload.put("mallKey",  mallKey);
        payload.put("channelCd", mallKey);
        payload.put("frDt",     request.frDt());
        payload.put("toDt",     request.toDt());
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
        String statusParam   = (status    == null || status.isBlank())    ? null : status;
        String channelParam  = (channelCd == null || channelCd.isBlank()) ? null : channelCd;

        List<HubJob> jobs  = hubJobMapper.selectJobList(statusParam, channelParam, size, offset);
        int total          = hubJobMapper.selectJobListCount(statusParam, channelParam);

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
            throw new IllegalStateException("FAILED 상태인 작업만 재시도할 수 있습니다.");
        }
        String latestPayload = rebuildPayloadForRetry(job);
        job.setPayload(latestPayload);
        job.setStatus(HubJobStatus.QUEUED);
        hubJobMapper.updateStatusToReset(job.getRequestKey(), latestPayload);
        publishEvent(job);
    }

    private String rebuildPayloadForRetry(HubJob job) {
        String[] parts = job.getRequestKey() != null ? job.getRequestKey().split("_") : new String[0];
        if (parts.length < 4) {
            throw new IllegalStateException("Invalid requestKey for retry: " + job.getRequestKey());
        }

        String mallKey = parts[0];
        String frDt = parts[1];
        String toDt = parts[2];
        String username = parts[3];
        HubUser user = userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("?ъ슜?먮? 李얠쓣 ???놁뒿?덈떎."));

        return serializePayload(mallKey, new HubJobBatchRequest(frDt, toDt, List.of(mallKey)), user);
    }

    private HubJobListItem toListItem(HubJob job) {
        String frDt = "";
        String toDt = "";
        if (job.getRequestKey() != null) {
            String[] parts = job.getRequestKey().split("_");
            if (parts.length > 1) frDt = parts[1];
            if (parts.length > 2) toDt = parts[2];
        }
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
}
