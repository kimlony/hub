package hub.job.execution.service;

import hub.job.execution.dto.response.JobAttemptSummary;
import hub.job.execution.dto.response.JobExecutionMetrics;
import java.time.OffsetDateTime;
import java.util.List;

public interface JobExecutionQueryService {

    List<JobAttemptSummary> getAttempts(String jobId);

    JobExecutionMetrics getMetrics(OffsetDateTime from, OffsetDateTime to, String jobType);
}
