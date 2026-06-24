package hub.schedule.dto.response;

import java.util.List;

public record CollectScheduleResponse(
        Long id,
        String scheduleName,
        List<String> mallKeys,
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
