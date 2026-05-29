package com.bizbee.hub.job;

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
