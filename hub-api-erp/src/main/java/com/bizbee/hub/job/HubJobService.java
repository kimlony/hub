package com.bizbee.hub.job;

public interface HubJobService {

    HubJobBatchResponse createBatchJobs(String username, HubJobBatchRequest request);

    HubJobBatchResponse createScheduledBatchJobs(String username, Long scheduleRunId, HubJobBatchRequest request);

    HubJobDetailResponse getJob(String requestId);

    HubJobListResponse getJobs(String status, String channelCd, int page, int size);

    HubDashboardResponse getDashboard();

    JobPerformanceResponse getPerformance(int minutes);

    HubJobLogResponse getJobLogs(String requestId);

    void retryJob(String requestId);
}
