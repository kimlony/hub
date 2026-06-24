package hub.worker.service;

import hub.worker.dto.response.WorkerStatusResponse;

public interface WorkerStatusService {

    WorkerStatusResponse getStatus();
}
