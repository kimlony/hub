package hub.loadtest.dto.response;

import java.util.List;

public record MockMallLoadTestStatusResponse(
        String runId,
        String scenario,
        String runStatus,
        long elapsedMs,
        double ordersPerSecond,
        double jobsPerSecond,
        double throughputPerMinute,
        double avgDurationMs,
        double p50DurationMs,
        double p95DurationMs,
        double maxDurationMs,
        int totalCollectJobs,
        int queuedCollectJobs,
        int processingCollectJobs,
        int successCollectJobs,
        int failedCollectJobs,
        int totalNormalizeJobs,
        int successNormalizeJobs,
        int failedNormalizeJobs,
        int normalizedOrders,
        OutboxStatus outbox,
        List<LogLine> logs,
        List<RunSummary> recentRuns
) {
    public record OutboxStatus(
            int total,
            int pending,
            int publishing,
            int sent,
            int failed
    ) {
    }

    public record LogLine(
            String createdAt,
            String requestId,
            String eventType,
            String level,
            String message,
            String errorMessage
    ) {
    }

    public record RunSummary(
            String runId,
            String scenario,
            String status,
            int totalRequested,
            int normalizedOrders,
            long elapsedMs,
            double ordersPerSecond,
            double jobsPerSecond,
            double p95DurationMs,
            int failedJobs,
            String startedAt,
            String completedAt
    ) {
    }
}
