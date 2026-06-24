package hub.outbox.service;

import hub.outbox.dto.response.JobOutboxMonitorResponse;

public interface JobOutboxMonitorService {

    JobOutboxMonitorResponse getMonitor(String status, int limit);
}
