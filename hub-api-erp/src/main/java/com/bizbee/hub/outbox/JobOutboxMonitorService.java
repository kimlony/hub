package com.bizbee.hub.outbox;

public interface JobOutboxMonitorService {

    JobOutboxMonitorResponse getMonitor(String status, int limit);
}
