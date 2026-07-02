package hub.job.controller;

import hub.job.dto.response.JobPipelineResponse;
import hub.job.service.JobPipelineService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/jobs")
@RequiredArgsConstructor
public class JobPipelineController {
    private final JobPipelineService service;

    @GetMapping("/{requestId}/pipeline")
    public ResponseEntity<JobPipelineResponse> getPipeline(
            @PathVariable String requestId,
            @RequestParam long corpId) {
        return ResponseEntity.ok(service.getPipeline(requestId, corpId));
    }
}
