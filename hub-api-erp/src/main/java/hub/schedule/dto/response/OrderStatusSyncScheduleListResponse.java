package hub.schedule.dto.response;

import java.util.List;

public record OrderStatusSyncScheduleListResponse(
        List<OrderStatusSyncScheduleResponse> schedules,
        List<OrderStatusSyncScheduleRunLogResponse> runLogs
) {
}
