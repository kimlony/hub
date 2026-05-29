package com.bizbee.hub.job;

import java.time.LocalDateTime;
import java.util.List;

public record HubDashboardResponse(
        DashboardStats stats,
        List<DashboardRecentJob> recentJobs,
        List<DashboardChannelStat> channelStats,
        LocalDateTime generatedAt
) {
}
