package hub.job.execution.controller;

import hub.job.execution.dto.response.JobAttemptSummary;
import hub.job.execution.dto.response.JobExecutionMetrics;
import hub.job.execution.service.JobExecutionQueryService;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class JobExecutionMetricsController {

    private final JobExecutionQueryService queryService;

    @GetMapping("/jobs/{jobId}/attempts")
    public List<JobAttemptSummary> getAttempts(@PathVariable String jobId) {
        return queryService.getAttempts(jobId);
    }

    @GetMapping("/job-execution-metrics")
    public JobExecutionMetrics getMetrics(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(required = false) String jobType
    ) {
        OffsetDateTime resolvedTo = to == null ? OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS) : to;
        OffsetDateTime resolvedFrom = from == null ? resolvedTo.minusDays(1) : from;
        return queryService.getMetrics(resolvedFrom, resolvedTo, jobType);
    }
}
