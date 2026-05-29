package com.bizbee.hub.schedule;

public interface CollectScheduleService {
    CollectScheduleListResponse getSchedules(String username);
    CollectScheduleResponse createSchedule(String username, CollectScheduleRequest request);
    CollectScheduleResponse updateSchedule(String username, Long id, CollectScheduleRequest request);
    void updateEnabled(String username, Long id, CollectScheduleEnabledRequest request);
    void deleteSchedule(String username, Long id);
    void runDueSchedules();
}
