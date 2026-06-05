package com.bizbee.hub.job;

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
