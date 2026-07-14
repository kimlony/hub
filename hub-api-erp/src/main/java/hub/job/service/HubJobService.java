package hub.job.service;

import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.request.OrderStatusSyncRequest;
import hub.job.dto.response.HubDashboardResponse;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.dto.response.HubJobDetailResponse;
import hub.job.dto.response.HubJobListResponse;
import hub.job.dto.response.HubJobLogResponse;
import hub.job.dto.response.JobPerformanceResponse;

public interface HubJobService {

    HubJobBatchResponse createBatchJobs(String username, HubJobBatchRequest request);

    HubJobBatchResponse createStatusSyncJobs(String username, OrderStatusSyncRequest request);

    HubJobBatchResponse createScheduledBatchJobs(String username, Long scheduleRunId, HubJobBatchRequest request);

    HubJobDetailResponse getJob(long corpId, String requestId);

    HubJobListResponse getJobs(long corpId, String status, String channelCd, int page, int size);

    HubDashboardResponse getDashboard(long corpId);

    JobPerformanceResponse getPerformance(long corpId, int minutes);

    HubJobLogResponse getJobLogs(long corpId, String requestId);

    void retryJob(long corpId, String requestId);
}
