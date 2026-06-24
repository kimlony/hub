package hub.job.dto.response;

public record LoadTestRunItem(
        Long id,
        String runId,
        String mode,
        Integer totalRequested,
        Integer totalJobs,
        Integer completedJobs,
        Integer successJobs,
        Integer failedJobs,
        Long elapsedMs,
        Double throughputPerMinute,
        Double avgDurationMs,
        Double p50DurationMs,
        Double p95DurationMs,
        Double maxDurationMs,
        String createdAt
) {
}
