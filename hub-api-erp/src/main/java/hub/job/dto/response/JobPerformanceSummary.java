package hub.job.dto.response;

public record JobPerformanceSummary(
        Long totalJobs,
        Long completedJobs,
        Long successJobs,
        Long failedJobs,
        Double avgDurationMs,
        Double p50DurationMs,
        Double p95DurationMs,
        Double maxDurationMs,
        Double throughputPerMinute
) {
}
