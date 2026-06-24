package hub.schedule.dto.response;

import java.util.List;

public record CollectScheduleListResponse(
        List<CollectScheduleResponse> schedules,
        List<CollectScheduleRunLogResponse> runLogs
) {
}
