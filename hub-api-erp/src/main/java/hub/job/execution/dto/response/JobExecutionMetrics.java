package hub.job.execution.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

public record JobExecutionMetrics(
        OffsetDateTime from,
        OffsetDateTime to,
        String jobType,
        long totalAttempts,
        long successAttempts,
        long recoveryAttempts,
        long leaseExpiredAttempts,
        long staleRejectedAttempts,
        double averageAttemptsPerJob,
        List<JobTypeDuration> durations
) {
    public record JobTypeDuration(
            String jobType,
            double averageDurationMs,
            double p95DurationMs,
            double p99DurationMs
    ) {
    }
}
