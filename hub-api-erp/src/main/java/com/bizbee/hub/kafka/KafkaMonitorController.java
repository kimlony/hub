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
            @RequestParam(defaultValue = "60") int minutes,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        return ResponseEntity.ok(kafkaMonitorService.getJobDistribution(minutes, page, size));
    }

    @GetMapping("/dlq")
    public ResponseEntity<KafkaDlqMessageResponse> getDlqMessages(
            @RequestParam(defaultValue = "20") int limit
    ) {
        return ResponseEntity.ok(kafkaMonitorService.getDlqMessages(limit));
    }
}
