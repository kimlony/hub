package com.bizbee.hub.job;

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
