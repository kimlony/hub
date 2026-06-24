package hub.job.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record HubDashboardResponse(
        DashboardStats stats,
        List<DashboardRecentJob> recentJobs,
        List<DashboardChannelStat> channelStats,
        JobPerformanceResponse performance,
        List<WorkerPerformanceItem> workerPerformance,
        List<LoadTestRunItem> loadTestRuns,
        LocalDateTime generatedAt
) {
}
