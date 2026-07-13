package hub.job.execution.service;

import hub.job.execution.dto.response.JobAttemptSummary;
import hub.job.execution.dto.response.JobExecutionMetrics;
import hub.job.execution.repository.JobExecutionQueryRepository;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobExecutionQueryServiceImpl implements JobExecutionQueryService {

    private final JobExecutionQueryRepository repository;

    @Transactional(readOnly = true)
    @Override
    public List<JobAttemptSummary> getAttempts(String jobId) {
        return repository.findAttempts(jobId);
    }

    @Transactional(readOnly = true)
    @Override
    public JobExecutionMetrics getMetrics(OffsetDateTime from, OffsetDateTime to, String jobType) {
        if (!from.isBefore(to)) {
            throw new IllegalArgumentException("from must be before to");
        }
        String normalizedJobType = jobType == null || jobType.isBlank() ? null : jobType.trim();
        JobExecutionQueryRepository.Aggregate aggregate = repository.findAggregate(from, to, normalizedJobType);
        return new JobExecutionMetrics(
                from,
                to,
                normalizedJobType,
                aggregate.totalAttempts(),
                aggregate.successAttempts(),
                aggregate.recoveryAttempts(),
                aggregate.leaseExpiredAttempts(),
                aggregate.staleRejectedAttempts(),
                aggregate.averageAttemptsPerJob(),
                repository.findDurations(from, to, normalizedJobType)
        );
    }
}
