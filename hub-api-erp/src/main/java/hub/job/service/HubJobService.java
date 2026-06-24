package hub.job.service;

import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubDashboardResponse;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.dto.response.HubJobDetailResponse;
import hub.job.dto.response.HubJobListResponse;
import hub.job.dto.response.HubJobLogResponse;
import hub.job.dto.response.JobPerformanceResponse;

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
