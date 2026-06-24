package hub.schedule.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelNotFoundException;
import hub.channel.mapper.ChannelMapper;
import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.service.HubJobService;
import hub.schedule.domain.CollectScheduleRow;
import hub.schedule.domain.CollectScheduleRunLogRow;
import hub.schedule.dto.request.CollectScheduleEnabledRequest;
import hub.schedule.dto.request.CollectScheduleRequest;
import hub.schedule.dto.response.CollectScheduleListResponse;
import hub.schedule.dto.response.CollectScheduleResponse;
import hub.schedule.dto.response.CollectScheduleRunLogResponse;
import hub.schedule.mapper.CollectScheduleMapper;
import java.time.format.DateTimeFormatter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class CollectScheduleServiceImpl implements CollectScheduleService {

    private static final DateTimeFormatter JOB_DATE_FORMAT = DateTimeFormatter.BASIC_ISO_DATE;

    private final CollectScheduleMapper collectScheduleMapper;
    private final UserMapper userMapper;
    private final ChannelMapper channelMapper;
    private final HubJobService hubJobService;
    private final ObjectMapper objectMapper;

    @Value("${hub.schedule.collect-catch-up-minutes:120}")
    private int collectCatchUpMinutes;

    @Transactional(readOnly = true)
    @Override
    public CollectScheduleListResponse getSchedules(String username) {
        HubUser user = findUser(username);
        return new CollectScheduleListResponse(
                collectScheduleMapper.findByUserId(user.getId()).stream()
                        .map(this::toResponse)
                        .toList(),
                collectScheduleMapper.findRunLogsByUserId(user.getId(), 20).stream()
                        .map(this::toRunLogResponse)
                        .toList()
        );
    }

    @Transactional
    @Override
    public CollectScheduleResponse createSchedule(String username, CollectScheduleRequest request) {
        HubUser user = findUser(username);
        validateRequest(user, request);

        CollectScheduleRow row = new CollectScheduleRow();
        row.setUserId(user.getId());
        row.setScheduleName(request.scheduleName().trim());
        row.setMallKeysJson(toJson(request.mallKeys()));
        row.setDateRangeType(normalizeDateRangeType(request.dateRangeType()));
        row.setRunTime(LocalTime.parse(request.runTime()));
        row.setEnabledYn(normalizeEnabledYn(request.enabledYn()));
        row.setNextRunAtValue(nextDailyRun(LocalDateTime.now(), row.getRunTime()));
        collectScheduleMapper.insert(row);

        return toResponse(collectScheduleMapper.findByUserIdAndId(user.getId(), row.getId()));
    }

    @Transactional
    @Override
    public CollectScheduleResponse updateSchedule(String username, Long id, CollectScheduleRequest request) {
        HubUser user = findUser(username);
        ensureScheduleExists(user.getId(), id);
        validateRequest(user, request);

        CollectScheduleRow row = new CollectScheduleRow();
        row.setId(id);
        row.setUserId(user.getId());
        row.setScheduleName(request.scheduleName().trim());
        row.setMallKeysJson(toJson(request.mallKeys()));
        row.setDateRangeType(normalizeDateRangeType(request.dateRangeType()));
        row.setRunTime(LocalTime.parse(request.runTime()));
        row.setEnabledYn(normalizeEnabledYn(request.enabledYn()));
        row.setNextRunAtValue(nextDailyRun(LocalDateTime.now(), row.getRunTime()));
        collectScheduleMapper.update(row);

        return toResponse(collectScheduleMapper.findByUserIdAndId(user.getId(), id));
    }

    @Transactional
    @Override
    public void updateEnabled(String username, Long id, CollectScheduleEnabledRequest request) {
        HubUser user = findUser(username);
        CollectScheduleRow existing = ensureScheduleExists(user.getId(), id);
        LocalTime runTime = parseRunTime(existing);
        collectScheduleMapper.updateEnabled(
                user.getId(),
                id,
                normalizeEnabledYn(request.enabledYn()),
                nextDailyRun(LocalDateTime.now(), runTime)
        );
    }

    @Transactional
    @Override
    public void deleteSchedule(String username, Long id) {
        HubUser user = findUser(username);
        collectScheduleMapper.delete(user.getId(), id);
    }

    @Scheduled(fixedDelayString = "${hub.schedule.collect-scan-ms:60000}")
    @Override
    public void runDueSchedules() {
        int skipped = collectScheduleMapper.skipStaleDueSchedules(collectCatchUpMinutes);
        if (skipped > 0) {
            log.info("stale collect schedules skipped: count={}, maxCatchUpMinutes={}",
                    skipped, collectCatchUpMinutes);
        }
        List<CollectScheduleRow> schedules = collectScheduleMapper.claimDueSchedules(20);
        for (CollectScheduleRow schedule : schedules) {
            runSchedule(schedule);
        }
    }

    private void runSchedule(CollectScheduleRow schedule) {
        LocalTime runTime = parseRunTime(schedule);
        LocalDateTime nextRunAt = nextDailyRun(LocalDateTime.now(), runTime);
        HubJobBatchRequest request = toJobRequest(schedule);
        CollectScheduleRunLogRow runLog = buildRunLog(schedule, request);
        collectScheduleMapper.insertRunLog(runLog);
        try {
            HubJobBatchResponse response = hubJobService.createScheduledBatchJobs(schedule.getUsername(), runLog.getId(), request);
            List<String> requestIds = response.jobs().stream()
                    .map(HubJobBatchResponse.JobResult::requestId)
                    .toList();
            collectScheduleMapper.markRunLogSuccess(runLog.getId(), requestIds.size(), toJson(requestIds));
            collectScheduleMapper.markRunSuccess(schedule.getId(), nextRunAt);
            log.info("collect schedule executed: id={}, user={}, malls={}",
                    schedule.getId(), schedule.getUsername(), schedule.getMallKeysJson());
        } catch (Exception e) {
            collectScheduleMapper.markRunLogFailed(runLog.getId(), e.getMessage());
            collectScheduleMapper.markRunFailed(schedule.getId(), nextRunAt, e.getMessage());
            log.warn("collect schedule failed: id={}, user={}", schedule.getId(), schedule.getUsername(), e);
        }
    }

    private CollectScheduleRunLogRow buildRunLog(CollectScheduleRow schedule, HubJobBatchRequest request) {
        CollectScheduleRunLogRow row = new CollectScheduleRunLogRow();
        row.setScheduleId(schedule.getId());
        row.setUserId(schedule.getUserId());
        row.setScheduleName(schedule.getScheduleName());
        row.setStatus("RUNNING");
        row.setMallKeysJson(toJson(request.mallKeys()));
        row.setDateRangeType(schedule.getDateRangeType());
        row.setFrDt(request.frDt());
        row.setToDt(request.toDt());
        row.setJobCount(0);
        row.setRequestIdsJson("[]");
        return row;
    }

    private HubJobBatchRequest toJobRequest(CollectScheduleRow schedule) {
        List<String> mallKeys = fromJson(schedule.getMallKeysJson());
        DateRange range = computeDateRange(schedule.getDateRangeType());
        return new HubJobBatchRequest(
                range.start().format(JOB_DATE_FORMAT),
                range.end().format(JOB_DATE_FORMAT),
                mallKeys
        );
    }

    private DateRange computeDateRange(String dateRangeType) {
        LocalDate today = LocalDate.now();
        return switch (normalizeDateRangeType(dateRangeType)) {
            case "TODAY" -> new DateRange(today, today);
            case "LAST_3_DAYS" -> new DateRange(today.minusDays(2), today);
            case "LAST_7_DAYS" -> new DateRange(today.minusDays(6), today);
            default -> new DateRange(today.minusDays(1), today.minusDays(1));
        };
    }

    private CollectScheduleRow ensureScheduleExists(Long userId, Long id) {
        CollectScheduleRow row = collectScheduleMapper.findByUserIdAndId(userId, id);
        if (row == null) {
            throw new IllegalArgumentException("schedule not found: " + id);
        }
        return row;
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("user not found"));
    }

    private void validateRequest(HubUser user, CollectScheduleRequest request) {
        normalizeDateRangeType(request.dateRangeType());
        for (String mallKey : request.mallKeys()) {
            channelMapper.findActiveByUserIdAndMallKey(user.getId(), mallKey)
                    .orElseThrow(() -> new ChannelNotFoundException(mallKey + " channel is not active"));
        }
    }

    private String normalizeDateRangeType(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase();
        return switch (normalized) {
            case "TODAY", "YESTERDAY", "LAST_3_DAYS", "LAST_7_DAYS" -> normalized;
            default -> throw new IllegalArgumentException("invalid dateRangeType: " + value);
        };
    }

    private String normalizeEnabledYn(String value) {
        return "N".equalsIgnoreCase(value) ? "N" : "Y";
    }

    private LocalTime parseRunTime(CollectScheduleRow row) {
        if (row.getRunTime() != null) {
            return row.getRunTime();
        }
        return LocalTime.parse(row.getRunTimeText().substring(0, 5));
    }

    private LocalDateTime nextDailyRun(LocalDateTime now, LocalTime runTime) {
        LocalDateTime next = LocalDateTime.of(now.toLocalDate(), runTime);
        if (!next.isAfter(now)) {
            next = next.plusDays(1);
        }
        return next;
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize mall keys", e);
        }
    }

    private List<String> fromJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to parse mall keys", e);
        }
    }

    private CollectScheduleResponse toResponse(CollectScheduleRow row) {
        return new CollectScheduleResponse(
                row.getId(),
                row.getScheduleName(),
                fromJson(row.getMallKeysJson()),
                row.getDateRangeType(),
                row.getRunTimeText() != null ? row.getRunTimeText().substring(0, 5) : row.getRunTime().toString(),
                row.getEnabledYn(),
                row.getRunningYn(),
                row.getLastRunAt(),
                row.getNextRunAt(),
                row.getLastErrorMessage(),
                row.getCreatedAt(),
                row.getUpdatedAt()
        );
    }

    private CollectScheduleRunLogResponse toRunLogResponse(CollectScheduleRunLogRow row) {
        return new CollectScheduleRunLogResponse(
                row.getId(),
                row.getScheduleId(),
                row.getScheduleName(),
                row.getStatus(),
                fromJson(row.getMallKeysJson()),
                row.getDateRangeType(),
                row.getFrDt(),
                row.getToDt(),
                row.getJobCount(),
                fromJson(row.getRequestIdsJson()),
                row.getErrorMessage(),
                row.getStartedAt(),
                row.getFinishedAt(),
                row.getCreatedAt()
        );
    }

    private record DateRange(LocalDate start, LocalDate end) {
    }
}
