package com.bizbee.hub.worker;

import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkerStatusServiceImpl implements WorkerStatusService {

    private final WorkerStatusMapper workerStatusMapper;

    @Override
    public WorkerStatusResponse getStatus() {
        List<WorkerStatusItem> workers = workerStatusMapper.selectWorkerStatuses();
        long onlineCount = workers.stream().filter(worker -> "ONLINE".equals(worker.status())).count();
        long staleCount = workers.stream().filter(worker -> "STALE".equals(worker.status())).count();
        long stoppedCount = workers.stream().filter(worker -> "STOPPED".equals(worker.status())).count();

        return new WorkerStatusResponse(
                new WorkerStatusStats(workers.size(), onlineCount, staleCount, stoppedCount),
                workers,
                LocalDateTime.now()
        );
    }
}
