package hub.job.execution.dto.response;

import hub.job.execution.domain.ClaimSource;
import hub.job.execution.domain.JobAttemptStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

public record JobAttemptSummary(
        long id,
        UUID attemptId,
        String jobId,
        String requestId,
        String jobType,
        long fencingToken,
        String workerId,
        ClaimSource claimSource,
        JobAttemptStatus status,
        OffsetDateTime claimedAt,
        OffsetDateTime leaseUntil,
        OffsetDateTime completedAt,
        Long durationMs,
        String errorCode,
        String errorMessage,
        OffsetDateTime staleRejectedAt
) {
}
