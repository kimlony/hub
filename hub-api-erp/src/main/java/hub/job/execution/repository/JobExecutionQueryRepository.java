package hub.job.execution.repository;

import hub.job.execution.domain.ClaimSource;
import hub.job.execution.domain.JobAttemptStatus;
import hub.job.execution.dto.response.JobAttemptSummary;
import hub.job.execution.dto.response.JobExecutionMetrics.JobTypeDuration;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class JobExecutionQueryRepository {

    private final JdbcTemplate jdbcTemplate;

    public List<JobAttemptSummary> findAttempts(String requestId) {
        return jdbcTemplate.query(
                """
                        SELECT id, attempt_id, request_id, job_type, fencing_token, worker_id,
                               claim_source, status, claimed_at, lease_until, completed_at,
                               duration_ms, error_code, error_message, stale_rejected_at
                        FROM hub_job_attempt
                        WHERE request_id = ?
                        ORDER BY claimed_at DESC, id DESC
                        """,
                (resultSet, rowNum) -> toSummary(resultSet),
                requestId
        );
    }

    public Aggregate findAggregate(OffsetDateTime from, OffsetDateTime to, String jobType) {
        return jdbcTemplate.queryForObject(
                """
                        SELECT
                            COUNT(*)::bigint AS total_attempts,
                            COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS success_attempts,
                            COUNT(*) FILTER (WHERE claim_source = 'RECOVERY')::bigint AS recovery_attempts,
                            COUNT(*) FILTER (WHERE status = 'EXPIRED')::bigint AS lease_expired_attempts,
                            COUNT(*) FILTER (WHERE stale_rejected_at IS NOT NULL)::bigint AS stale_rejected_attempts,
                            COALESCE(COUNT(*)::float8 / NULLIF(COUNT(DISTINCT request_id), 0), 0)::float8
                                AS average_attempts_per_job
                        FROM hub_job_attempt
                        WHERE claimed_at >= ?
                          AND claimed_at < ?
                          AND (? IS NULL OR job_type = ?)
                        """,
                (resultSet, rowNum) -> new Aggregate(
                        resultSet.getLong("total_attempts"),
                        resultSet.getLong("success_attempts"),
                        resultSet.getLong("recovery_attempts"),
                        resultSet.getLong("lease_expired_attempts"),
                        resultSet.getLong("stale_rejected_attempts"),
                        resultSet.getDouble("average_attempts_per_job")
                ),
                from, to, jobType, jobType
        );
    }

    public List<JobTypeDuration> findDurations(OffsetDateTime from, OffsetDateTime to, String jobType) {
        return jdbcTemplate.query(
                """
                        SELECT job_type,
                               COALESCE(AVG(duration_ms), 0)::float8 AS average_duration_ms,
                               COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::float8
                                   AS p95_duration_ms,
                               COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::float8
                                   AS p99_duration_ms
                        FROM hub_job_attempt
                        WHERE claimed_at >= ?
                          AND claimed_at < ?
                          AND completed_at IS NOT NULL
                          AND duration_ms IS NOT NULL
                          AND (? IS NULL OR job_type = ?)
                        GROUP BY job_type
                        ORDER BY job_type
                        """,
                (resultSet, rowNum) -> new JobTypeDuration(
                        resultSet.getString("job_type"),
                        resultSet.getDouble("average_duration_ms"),
                        resultSet.getDouble("p95_duration_ms"),
                        resultSet.getDouble("p99_duration_ms")
                ),
                from, to, jobType, jobType
        );
    }

    private JobAttemptSummary toSummary(ResultSet resultSet) throws SQLException {
        String requestId = resultSet.getString("request_id");
        return new JobAttemptSummary(
                resultSet.getLong("id"),
                resultSet.getObject("attempt_id", UUID.class),
                requestId,
                requestId,
                resultSet.getString("job_type"),
                resultSet.getLong("fencing_token"),
                resultSet.getString("worker_id"),
                ClaimSource.valueOf(resultSet.getString("claim_source")),
                JobAttemptStatus.valueOf(resultSet.getString("status")),
                resultSet.getObject("claimed_at", OffsetDateTime.class),
                resultSet.getObject("lease_until", OffsetDateTime.class),
                resultSet.getObject("completed_at", OffsetDateTime.class),
                resultSet.getObject("duration_ms", Long.class),
                resultSet.getString("error_code"),
                resultSet.getString("error_message"),
                resultSet.getObject("stale_rejected_at", OffsetDateTime.class)
        );
    }

    public record Aggregate(
            long totalAttempts,
            long successAttempts,
            long recoveryAttempts,
            long leaseExpiredAttempts,
            long staleRejectedAttempts,
            double averageAttemptsPerJob
    ) {
    }
}
