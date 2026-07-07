package hub.schedule.dto.response;

import java.util.List;

public record OrderStatusSyncScheduleRunLogResponse(
        Long id,
        Long scheduleId,
        String scheduleName,
        String status,
        List<String> mallKeys,
        List<Long> channelAccountIds,
        List<String> statusTypes,
        String dateRangeType,
        String frDt,
        String toDt,
        Integer jobCount,
        List<String> requestIds,
        String errorMessage,
        String startedAt,
        String finishedAt,
        String createdAt
) {
}
