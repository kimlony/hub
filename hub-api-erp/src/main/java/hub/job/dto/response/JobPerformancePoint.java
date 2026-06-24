package hub.job.dto.response;

public record JobPerformancePoint(
        String bucket,
        Long totalJobs,
        Long completedJobs,
        Long successJobs,
        Long failedJobs,
        Double avgDurationMs,
        Double p95DurationMs
) {
}
