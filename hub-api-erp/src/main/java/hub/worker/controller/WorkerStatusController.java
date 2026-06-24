package hub.worker.controller;

import hub.worker.dto.response.WorkerStatusResponse;
import hub.worker.service.WorkerStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/workers")
@RequiredArgsConstructor
public class WorkerStatusController {

    private final WorkerStatusService workerStatusService;

    @GetMapping("/status")
    public ResponseEntity<WorkerStatusResponse> getStatus() {
        return ResponseEntity.ok(workerStatusService.getStatus());
    }
}
