package hub.job.dto.response;

public record DashboardStats(
        Long todayTotal,
        Long todaySuccess,
        Long todayFailed,
        Long queued,
        Long processing,
        Long retryWaiting,
        Double todaySuccessRate
) {
}
