package hub.job.execution.repository;

import static org.assertj.core.api.Assertions.assertThat;

import hub.job.execution.dto.response.JobExecutionMetrics.JobTypeDuration;
import hub.support.IntegrationTestDatabase;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class JobExecutionQueryRepositoryIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private JobExecutionQueryRepository repository;

    @BeforeEach
    void setUp() {
        jdbcTemplate = new JdbcTemplate(IntegrationTestDatabase.dataSource());
        repository = new JobExecutionQueryRepository(jdbcTemplate);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS hub_job_attempt (
                    id BIGSERIAL PRIMARY KEY,
                    attempt_id UUID NOT NULL UNIQUE,
                    request_id VARCHAR(100) NOT NULL,
                    job_type VARCHAR(100) NOT NULL,
                    fencing_token BIGINT NOT NULL,
                    worker_id VARCHAR(120) NOT NULL,
                    claim_source VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    claimed_at TIMESTAMPTZ NOT NULL,
                    lease_until TIMESTAMPTZ NOT NULL,
                    completed_at TIMESTAMPTZ,
                    duration_ms BIGINT,
                    error_code VARCHAR(100),
                    error_message TEXT,
                    stale_rejected_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (request_id, fencing_token)
                )
                """);
        jdbcTemplate.update("DELETE FROM hub_job_attempt WHERE request_id LIKE 'attempt-metrics-%'");
        insertAttempt("attempt-metrics-1", "ORDER_COLLECT", 1, "KAFKA", "SUCCESS", 100, false);
        insertAttempt("attempt-metrics-2", "ORDER_COLLECT", 1, "KAFKA", "SUCCESS", 200, false);
        insertAttempt("attempt-metrics-3", "ORDER_COLLECT", 1, "RECOVERY", "RETRY", 300, false);
        insertAttempt("attempt-metrics-4", "ORDER_COLLECT", 1, "KAFKA", "EXPIRED", 400, true);
        insertAttempt("attempt-metrics-5", "ORDER_COLLECT", 1, "KAFKA", "SUCCESS", 500, false);
        insertAttempt("attempt-metrics-6", "ERP_APPLY", 1, "KAFKA", "SUCCESS", 1000, false);
    }

    @Test
    void calculatesFilteredMetricsAndPostgresPercentiles() {
        OffsetDateTime from = OffsetDateTime.now().minusDays(1);
        OffsetDateTime to = OffsetDateTime.now().plusDays(1);

        JobExecutionQueryRepository.Aggregate aggregate = repository.findAggregate(from, to, "ORDER_COLLECT");
        List<JobTypeDuration> durations = repository.findDurations(from, to, "ORDER_COLLECT");

        assertThat(aggregate.totalAttempts()).isEqualTo(5);
        assertThat(aggregate.successAttempts()).isEqualTo(3);
        assertThat(aggregate.recoveryAttempts()).isEqualTo(1);
        assertThat(aggregate.leaseExpiredAttempts()).isEqualTo(1);
        assertThat(aggregate.staleRejectedAttempts()).isEqualTo(1);
        assertThat(aggregate.averageAttemptsPerJob()).isEqualTo(1.0);
        assertThat(durations).singleElement().satisfies(duration -> {
            assertThat(duration.jobType()).isEqualTo("ORDER_COLLECT");
            assertThat(duration.averageDurationMs()).isEqualTo(300.0);
            assertThat(duration.p95DurationMs()).isEqualTo(480.0);
            assertThat(duration.p99DurationMs()).isEqualTo(496.0);
        });
    }

    @Test
    void returnsAttemptHistoryForExactJobPrimaryKey() {
        assertThat(repository.findAttempts("attempt-metrics-1"))
                .singleElement()
                .satisfies(attempt -> {
                    assertThat(attempt.jobId()).isEqualTo("attempt-metrics-1");
                    assertThat(attempt.requestId()).isEqualTo("attempt-metrics-1");
                    assertThat(attempt.status().name()).isEqualTo("SUCCESS");
                    assertThat(attempt.durationMs()).isEqualTo(100L);
                });
    }

    private void insertAttempt(
            String requestId,
            String jobType,
            long fencingToken,
            String claimSource,
            String status,
            long durationMs,
            boolean staleRejected
    ) {
        jdbcTemplate.update("""
                INSERT INTO hub_job_attempt (
                    attempt_id, request_id, job_type, fencing_token, worker_id, claim_source,
                    status, claimed_at, lease_until, completed_at, duration_ms, stale_rejected_at
                ) VALUES (
                    gen_random_uuid(), ?, ?, ?, 'test-worker', ?, ?,
                    NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', NOW(), ?,
                    CASE WHEN ? THEN NOW() ELSE NULL END
                )
                """, requestId, jobType, fencingToken, claimSource, status, durationMs, staleRejected);
    }
}
