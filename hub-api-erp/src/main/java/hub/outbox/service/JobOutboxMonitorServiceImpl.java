package hub.outbox.service;

import hub.outbox.dto.response.JobOutboxItem;
import hub.outbox.dto.response.JobOutboxMonitorResponse;
import hub.outbox.dto.response.JobOutboxStats;
import hub.outbox.mapper.JobOutboxMapper;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobOutboxMonitorServiceImpl implements JobOutboxMonitorService {

    private final JobOutboxMapper jobOutboxMapper;

    @Value("${hub.outbox.publishing-stale-seconds:300}")
    private int publishingStaleSeconds;

    @Override
    public JobOutboxMonitorResponse getMonitor(String status, int limit) {
        String safeStatus = normalizeStatus(status);
        int safeLimit = Math.max(1, Math.min(limit, 100));
        JobOutboxStats stats = jobOutboxMapper.selectStats(publishingStaleSeconds);
        List<JobOutboxItem> events = jobOutboxMapper.selectRecent(safeStatus, safeLimit);
        return new JobOutboxMonitorResponse(stats, events, "HEALTHY", LocalDateTime.now());
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return status.trim().toUpperCase();
    }
}
