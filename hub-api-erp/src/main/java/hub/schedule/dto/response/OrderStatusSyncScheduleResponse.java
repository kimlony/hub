package hub.schedule.dto.response;

import java.util.List;

public record OrderStatusSyncScheduleResponse(
        Long id,
        String scheduleName,
        List<String> mallKeys,
        List<Long> channelAccountIds,
        List<String> statusTypes,
        String scheduleMode,
        Integer intervalHours,
        String dateRangeType,
        String runTime,
        String enabledYn,
        String runningYn,
        String lastRunAt,
        String nextRunAt,
        String lastErrorMessage,
        String createdAt,
        String updatedAt
) {
}