package hub.job.controller;

import hub.auth.HubUserPrincipal;
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
            @AuthenticationPrincipal HubUserPrincipal principal,
            @Valid @RequestBody HubJobBatchRequest request
    ) {
        return ResponseEntity.ok(hubJobService.createBatchJobs(principal.username(), request));
    }

    @PostMapping("/status-sync")
    public ResponseEntity<HubJobBatchResponse> createStatusSyncJobs(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @Valid @RequestBody OrderStatusSyncRequest request
    ) {
        return ResponseEntity.ok(hubJobService.createStatusSyncJobs(principal.username(), request));
    }

    @GetMapping
    public ResponseEntity<HubJobListResponse> getJobs(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(hubJobService.getJobs(principal.corpId(), status, channelCd, page, size));
    }

    @GetMapping("/dashboard")
    public ResponseEntity<HubDashboardResponse> getDashboard(@AuthenticationPrincipal HubUserPrincipal principal) {
        return ResponseEntity.ok(hubJobService.getDashboard(principal.corpId()));
    }

    @GetMapping("/performance")
    public ResponseEntity<JobPerformanceResponse> getPerformance(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @RequestParam(defaultValue = "60") int minutes
    ) {
        return ResponseEntity.ok(hubJobService.getPerformance(principal.corpId(), minutes));
    }

    @GetMapping("/{requestId}")
    public ResponseEntity<HubJobDetailResponse> getJob(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable String requestId) {
        return ResponseEntity.ok(hubJobService.getJob(principal.corpId(), requestId));
    }

    @GetMapping("/{requestId}/logs")
    public ResponseEntity<HubJobLogResponse> getJobLogs(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable String requestId) {
        return ResponseEntity.ok(hubJobService.getJobLogs(principal.corpId(), requestId));
    }

    @PostMapping("/{requestId}/retry")
    public ResponseEntity<Void> retryJob(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable String requestId) {
        hubJobService.retryJob(principal.corpId(), requestId);
        return ResponseEntity.ok().build();
    }
}
