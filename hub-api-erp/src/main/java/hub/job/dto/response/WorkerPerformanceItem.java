package hub.job.dto.response;

public record WorkerPerformanceItem(
        String workerInstanceId,
        String kafkaClientId,
        String source,
        Long completedJobs,
        Long successJobs,
        Long failedJobs,
        Double avgDurationMs,
        Double p95DurationMs,
        Double maxDurationMs,
        Double throughputPerMinute,
        String lastCompletedAt
) {
}
