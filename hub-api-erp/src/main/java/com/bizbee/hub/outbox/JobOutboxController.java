package com.bizbee.hub.outbox;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/outbox")
@RequiredArgsConstructor
public class JobOutboxController {

    private final JobOutboxMonitorService jobOutboxMonitorService;

    @GetMapping("/monitor")
    public ResponseEntity<JobOutboxMonitorResponse> getMonitor(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "50") int limit
    ) {
        return ResponseEntity.ok(jobOutboxMonitorService.getMonitor(status, limit));
    }
}
