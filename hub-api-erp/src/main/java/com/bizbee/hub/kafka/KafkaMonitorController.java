package com.bizbee.hub.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/kafka")
@RequiredArgsConstructor
public class KafkaMonitorController {

    private final KafkaMonitorService kafkaMonitorService;

    @GetMapping("/monitor")
    public ResponseEntity<KafkaMonitorResponse> getMonitor() {
        return ResponseEntity.ok(kafkaMonitorService.getMonitor());
    }

    @GetMapping("/job-distribution")
    public ResponseEntity<KafkaJobDistributionResponse> getJobDistribution(
            @RequestParam(defaultValue = "60") int minutes
    ) {
        return ResponseEntity.ok(kafkaMonitorService.getJobDistribution(minutes));
    }
}
