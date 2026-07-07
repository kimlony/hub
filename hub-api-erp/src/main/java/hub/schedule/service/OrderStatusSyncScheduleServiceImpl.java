package hub.schedule.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.ChannelNotFoundException;
import hub.channel.mapper.ChannelMapper;
import hub.job.dto.request.OrderStatusSyncRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.service.HubJobService;
import hub.schedule.domain.OrderStatusSyncScheduleRow;
import hub.schedule.domain.OrderStatusSyncScheduleRunLogRow;
import hub.schedule.dto.request.OrderStatusSyncScheduleEnabledRequest;
import hub.schedule.dto.request.OrderStatusSyncScheduleRequest;
import hub.schedule.dto.response.OrderStatusSyncScheduleListResponse;
import hub.schedule.dto.response.OrderStatusSyncScheduleResponse;
import hub.schedule.dto.response.OrderStatusSyncScheduleRunLogResponse;
import hub.schedule.mapper.OrderStatusSyncScheduleMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderStatusSyncScheduleServiceImpl implements OrderStatusSyncScheduleService {

    private static final DateTimeFormatter JOB_DATE_FORMAT = DateTimeFormatter.BASIC_ISO_DATE;
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<Long>> LONG_LIST_TYPE = new TypeReference<>() {};

    private final OrderStatusSyncScheduleMapper orderStatusSyncScheduleMapper;
    private final UserMapper userMapper;
    private final ChannelMapper channelMapper;
    private final HubJobService hubJobService;
    private final ObjectMapper objectMapper;

    @Value("${hub.schedule.status-sync-catch-up-minutes:120}")
    private int statusSyncCatchUpMinutes;

    @Transactional(readOnly = true)
    @Override
    public OrderStatusSyncScheduleListResponse getSchedules(String username) {
        HubUser user = findUser(username);
        return new OrderStatusSyncScheduleListResponse(
                orderStatusSyncScheduleMapper.findByUserId(user.getId()).stream()
                        .map(this::toResponse)
                        .toList(),
                orderStatusSyncScheduleMapper.findRunLogsByUserId(user.getId(), 20).stream()
                        .map(this::toRunLogResponse)
                        .toList()
        );
    }

    @Transactional
    @Override
    public OrderStatusSyncScheduleResponse createSchedule(String username, OrderStatusSyncScheduleRequest request) {
        HubUser user = findUser(username);
        validateRequest(user, request);

        OrderStatusSyncScheduleRow row = new OrderStatusSyncScheduleRow();
        row.setUserId(user.getId());
        row.setScheduleName(request.scheduleName().trim());
        row.setMallKeysJson(toJson(nullToEmpty(request.mallKeys())));
        row.setChannelAccountIdsJson(toJson(nullToEmpty(request.channelAccountIds())));
        row.setStatusTypesJson(toJson(request.statusTypes()));
        row.setDateRangeType(normalizeDateRangeType(request.dateRangeType()));
        row.setScheduleMode(normalizeScheduleMode(request.scheduleMode()));
        row.setIntervalHours(normalizeIntervalHours(row.getScheduleMode(), request.intervalHours()));
        row.setRunTime(LocalTime.parse(request.runTime()));
        row.setEnabledYn(normalizeEnabledYn(request.enabledYn()));
        row.setNextRunAtValue(nextRunAtFor(row, LocalDateTime.now()));
        orderStatusSyncScheduleMapper.insert(row);

        return toResponse(orderStatusSyncScheduleMapper.findByUserIdAndId(user.getId(), row.getId()));
    }

    @Transactional
    @Override
    public OrderStatusSyncScheduleResponse updateSchedule(
            String username,
            Long id,
            OrderStatusSyncScheduleRequest request
    ) {
        HubUser user = findUser(username);
        ensureScheduleExists(user.getId(), id);
        validateRequest(user, request);

        OrderStatusSyncScheduleRow row = new OrderStatusSyncScheduleRow();
        row.setId(id);
        row.setUserId(user.getId());
        row.setScheduleName(request.scheduleName().trim());
        row.setMallKeysJson(toJson(nullToEmpty(request.mallKeys())));
        row.setChannelAccountIdsJson(toJson(nullToEmpty(request.channelAccountIds())));
        row.setStatusTypesJson(toJson(request.statusTypes()));
        row.setDateRangeType(normalizeDateRangeType(request.dateRangeType()));
        row.setScheduleMode(normalizeScheduleMode(request.scheduleMode()));
        row.setIntervalHours(normalizeIntervalHours(row.getScheduleMode(), request.intervalHours()));
        row.setRunTime(LocalTime.parse(request.runTime()));
        row.setEnabledYn(normalizeEnabledYn(request.enabledYn()));
        row.setNextRunAtValue(nextRunAtFor(row, LocalDateTime.now()));
        orderStatusSyncScheduleMapper.update(row);

        return toResponse(orderStatusSyncScheduleMapper.findByUserIdAndId(user.getId(), id));
    }

    @Transactional
    @Override
    public void updateEnabled(String username, Long id, OrderStatusSyncScheduleEnabledRequest request) {
        HubUser user = findUser(username);
        OrderStatusSyncScheduleRow existing = ensureScheduleExists(user.getId(), id);
        orderStatusSyncScheduleMapper.updateEnabled(
                user.getId(),
                id,
                normalizeEnabledYn(request.enabledYn()),
                nextRunAtFor(existing, LocalDateTime.now())
        );
    }

    @Transactional
    @Override
    public void deleteSchedule(String username, Long id) {
        HubUser user = findUser(username);
        orderStatusSyncScheduleMapper.delete(user.getId(), id);
    }

    @Scheduled(fixedDelayString = "${hub.schedule.status-sync-scan-ms:60000}")
    @Override
    public void runDueSchedules() {
        int skipped = orderStatusSyncScheduleMapper.skipStaleDueSchedules(statusSyncCatchUpMinutes);
        if (skipped > 0) {
            log.info("stale order status sync schedules skipped: count={}, maxCatchUpMinutes={}",
                    skipped, statusSyncCatchUpMinutes);
        }
        List<OrderStatusSyncScheduleRow> schedules = orderStatusSyncScheduleMapper.claimDueSchedules(20);
        for (OrderStatusSyncScheduleRow schedule : schedules) {
            runSchedule(schedule);
        }
    }

    private void runSchedule(OrderStatusSyncScheduleRow schedule) {
        LocalDateTime nextRunAt = nextRunAtFor(schedule, LocalDateTime.now());
        OrderStatusSyncRequest request = toJobRequest(schedule);
        OrderStatusSyncScheduleRunLogRow runLog = buildRunLog(schedule, request);
        orderStatusSyncScheduleMapper.insertRunLog(runLog);
        try {
            HubJobBatchResponse response = hubJobService.createStatusSyncJobs(schedule.getUsername(), request);
            List<String> requestIds = response.jobs().stream()
                    .map(HubJobBatchResponse.JobResult::requestId)
                    .toList();
            orderStatusSyncScheduleMapper.markRunLogSuccess(runLog.getId(), requestIds.size(), toJson(requestIds));
            orderStatusSyncScheduleMapper.markRunSuccess(schedule.getId(), nextRunAt);
            log.info("order status sync schedule executed: id={}, user={}, malls={}, channelAccounts={}",
                    schedule.getId(), schedule.getUsername(),
                    schedule.getMallKeysJson(), schedule.getChannelAccountIdsJson());
        } catch (Exception e) {
            orderStatusSyncScheduleMapper.markRunLogFailed(runLog.getId(), e.getMessage());
            orderStatusSyncScheduleMapper.markRunFailed(schedule.getId(), nextRunAt, e.getMessage());
            log.warn("order status sync schedule failed: id={}, user={}",
                    schedule.getId(), schedule.getUsername(), e);
        }
    }

    private OrderStatusSyncScheduleRunLogRow buildRunLog(
            OrderStatusSyncScheduleRow schedule,
            OrderStatusSyncRequest request
    ) {
        OrderStatusSyncScheduleRunLogRow row = new OrderStatusSyncScheduleRunLogRow();
        row.setScheduleId(schedule.getId());
        row.setUserId(schedule.getUserId());
        row.setScheduleName(schedule.getScheduleName());
        row.setStatus("RUNNING");
        row.setMallKeysJson(toJson(nullToEmpty(request.mallKeys())));
        row.setChannelAccountIdsJson(toJson(nullToEmpty(request.channelAccountIds())));
        row.setStatusTypesJson(toJson(request.statusTypes()));
        row.setDateRangeType(schedule.getDateRangeType());
        row.setFrDt(request.frDt());
        row.setToDt(request.toDt());
        row.setJobCount(0);
        row.setRequestIdsJson("[]");
        return row;
    }

    private OrderStatusSyncRequest toJobRequest(OrderStatusSyncScheduleRow schedule) {
        List<String> mallKeys = fromStringListJson(schedule.getMallKeysJson());
        List<Long> channelAccountIds = fromLongListJson(schedule.getChannelAccountIdsJson());
        DateRange range = computeDateRange(schedule.getDateRangeType());
        return new OrderStatusSyncRequest(
                range.start().format(JOB_DATE_FORMAT),
                range.end().format(JOB_DATE_FORMAT),
                emptyToNull(mallKeys),
                emptyToNull(channelAccountIds),
                fromStringListJson(schedule.getStatusTypesJson())
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

    private OrderStatusSyncScheduleRow ensureScheduleExists(Long userId, Long id) {
        OrderStatusSyncScheduleRow row = orderStatusSyncScheduleMapper.findByUserIdAndId(userId, id);
        if (row == null) {
            throw new IllegalArgumentException("order status sync schedule not found: " + id);
        }
        return row;
    }

    private HubUser findUser(String username) {
        return userMapper.findByUsername(username)
                .orElseThrow(() -> new AuthException("user not found"));
    }

    private void validateRequest(HubUser user, OrderStatusSyncScheduleRequest request) {
        normalizeDateRangeType(request.dateRangeType());
        List<String> mallKeys = nullToEmpty(request.mallKeys());
        List<Long> channelAccountIds = nullToEmpty(request.channelAccountIds());
        if (mallKeys.isEmpty() && channelAccountIds.isEmpty()) {
            throw new IllegalArgumentException("mallKeys or channelAccountIds must not be empty");
        }
        for (String mallKey : mallKeys) {
            if ("MOCK_MALL".equals(mallKey)) {
                continue;
            }
            if (channelMapper.findActiveByCorpIdAndMallKey(user.getCorpId(), mallKey).isEmpty()) {
                throw new ChannelNotFoundException(mallKey + " channel has no active account");
            }
        }
        for (Long channelAccountId : channelAccountIds) {
            channelMapper.findActiveByCorpIdAndId(user.getCorpId(), channelAccountId)
                    .orElseThrow(() -> new ChannelNotFoundException(
                            "channel account is not active: " + channelAccountId));
        }
    }

    private String normalizeDateRangeType(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase();
        return switch (normalized) {
            case "TODAY", "YESTERDAY", "LAST_3_DAYS", "LAST_7_DAYS" -> normalized;
            default -> throw new IllegalArgumentException("invalid dateRangeType: " + value);
        };
    }

    private String normalizeScheduleMode(String value) {
        String normalized = value == null || value.isBlank() ? "FIXED_TIME" : value.trim().toUpperCase();
        return switch (normalized) {
            case "FIXED_TIME", "INTERVAL" -> normalized;
            default -> throw new IllegalArgumentException("invalid scheduleMode: " + value);
        };
    }

    private Integer normalizeIntervalHours(String scheduleMode, Integer intervalHours) {
        if (!"INTERVAL".equals(scheduleMode)) {
            return null;
        }
        if (intervalHours == null || intervalHours < 1 || intervalHours > 24) {
            throw new IllegalArgumentException("intervalHours must be between 1 and 24");
        }
        return intervalHours;
    }

    private LocalDateTime nextRunAtFor(OrderStatusSyncScheduleRow row, LocalDateTime now) {
        if ("INTERVAL".equals(normalizeScheduleMode(row.getScheduleMode()))) {
            return now.plusHours(normalizeIntervalHours("INTERVAL", row.getIntervalHours()));
        }
        return nextDailyRun(now, parseRunTime(row));
    }
    private String normalizeEnabledYn(String value) {
        return "N".equalsIgnoreCase(value) ? "N" : "Y";
    }

    private LocalTime parseRunTime(OrderStatusSyncScheduleRow row) {
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

    private String toJson(Object values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to serialize order status sync schedule value", e);
        }
    }

    private List<String> fromStringListJson(String json) {
        try {
            return objectMapper.readValue(json, STRING_LIST_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to parse order status sync string list", e);
        }
    }

    private List<Long> fromLongListJson(String json) {
        try {
            return objectMapper.readValue(json, LONG_LIST_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("failed to parse order status sync channel account ids", e);
        }
    }

    private OrderStatusSyncScheduleResponse toResponse(OrderStatusSyncScheduleRow row) {
        return new OrderStatusSyncScheduleResponse(
                row.getId(),
                row.getScheduleName(),
                fromStringListJson(row.getMallKeysJson()),
                fromLongListJson(row.getChannelAccountIdsJson()),
                fromStringListJson(row.getStatusTypesJson()),
                normalizeScheduleMode(row.getScheduleMode()),
                row.getIntervalHours(),
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

    private OrderStatusSyncScheduleRunLogResponse toRunLogResponse(OrderStatusSyncScheduleRunLogRow row) {
        return new OrderStatusSyncScheduleRunLogResponse(
                row.getId(),
                row.getScheduleId(),
                row.getScheduleName(),
                row.getStatus(),
                fromStringListJson(row.getMallKeysJson()),
                fromLongListJson(row.getChannelAccountIdsJson()),
                fromStringListJson(row.getStatusTypesJson()),
                row.getDateRangeType(),
                row.getFrDt(),
                row.getToDt(),
                row.getJobCount(),
                fromStringListJson(row.getRequestIdsJson()),
                row.getErrorMessage(),
                row.getStartedAt(),
                row.getFinishedAt(),
                row.getCreatedAt()
        );
    }

    private <T> List<T> nullToEmpty(List<T> values) {
        return values == null ? List.of() : values;
    }

    private <T> List<T> emptyToNull(List<T> values) {
        return values == null || values.isEmpty() ? null : values;
    }

    private record DateRange(LocalDate start, LocalDate end) {
    }
}
