package hub.job.service;

import hub.job.dto.response.JobPipelineResponse;

public interface JobPipelineService {
    JobPipelineResponse getPipeline(long corpId, String requestId);
}
