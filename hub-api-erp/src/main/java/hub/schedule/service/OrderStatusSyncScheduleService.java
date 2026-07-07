package hub.schedule.service;

import hub.schedule.dto.request.OrderStatusSyncScheduleEnabledRequest;
import hub.schedule.dto.request.OrderStatusSyncScheduleRequest;
import hub.schedule.dto.response.OrderStatusSyncScheduleListResponse;
import hub.schedule.dto.response.OrderStatusSyncScheduleResponse;

public interface OrderStatusSyncScheduleService {
    OrderStatusSyncScheduleListResponse getSchedules(String username);
    OrderStatusSyncScheduleResponse createSchedule(String username, OrderStatusSyncScheduleRequest request);
    OrderStatusSyncScheduleResponse updateSchedule(String username, Long id, OrderStatusSyncScheduleRequest request);
    void updateEnabled(String username, Long id, OrderStatusSyncScheduleEnabledRequest request);
    void deleteSchedule(String username, Long id);
    void runDueSchedules();
}
