package hub.job.controller;

import hub.auth.HubUserPrincipal;
import hub.job.dto.response.JobPipelineResponse;
import hub.job.service.JobPipelineService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/jobs")
@RequiredArgsConstructor
public class JobPipelineController {
    private final JobPipelineService service;

    @GetMapping("/{requestId}/pipeline")
    public ResponseEntity<JobPipelineResponse> getPipeline(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable String requestId) {
        return ResponseEntity.ok(service.getPipeline(principal.corpId(), requestId));
    }
}
