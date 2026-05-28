package com.bizbee.hub.job;

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

    @GetMapping
    public ResponseEntity<HubJobListResponse> getJobs(
            @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(hubJobService.getJobs(status, channelCd, page, size));
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
