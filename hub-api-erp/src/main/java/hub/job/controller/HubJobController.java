package hub.job.controller;

import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.request.OrderStatusSyncRequest;
import hub.job.dto.response.HubDashboardResponse;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.dto.response.HubJobDetailResponse;
import hub.job.dto.response.HubJobListResponse;
import hub.job.dto.response.HubJobLogResponse;
import hub.job.dto.response.JobPerformanceResponse;
import hub.job.service.HubJobService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/jobs")
@RequiredArgsConstructor
public class HubJobController {

    private final HubJobService hubJobService;

    @PostMapping("/batch")
    public ResponseEntity<HubJobBatchResponse> createBatchJobs(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody HubJobBatchRequest request
    ) {
        return ResponseEntity.ok(hubJobService.createBatchJobs(username, request));
    }

    @PostMapping("/status-sync")
    public ResponseEntity<HubJobBatchResponse> createStatusSyncJobs(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody OrderStatusSyncRequest request
    ) {
        return ResponseEntity.ok(hubJobService.createStatusSyncJobs(username, request));
    }

    @GetMapping
    public ResponseEntity<HubJobListResponse> getJobs(
            @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(hubJobService.getJobs(status, channelCd, page, size));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<HubDashboardResponse> getDashboard() {
        return ResponseEntity.ok(hubJobService.getDashboard());
    }

    @GetMapping("/performance")
    public ResponseEntity<JobPerformanceResponse> getPerformance(
            @RequestParam(defaultValue = "60") int minutes
    ) {
        return ResponseEntity.ok(hubJobService.getPerformance(minutes));
    }

    @GetMapping("/{requestId}")
    public ResponseEntity<HubJobDetailResponse> getJob(@PathVariable String requestId) {
        return ResponseEntity.ok(hubJobService.getJob(requestId));
    }

    @GetMapping("/{requestId}/logs")
    public ResponseEntity<HubJobLogResponse> getJobLogs(@PathVariable String requestId) {
        return ResponseEntity.ok(hubJobService.getJobLogs(requestId));
    }

    @PostMapping("/{requestId}/retry")
    public ResponseEntity<Void> retryJob(@PathVariable String requestId) {
        hubJobService.retryJob(requestId);
        return ResponseEntity.ok().build();
    }
}
