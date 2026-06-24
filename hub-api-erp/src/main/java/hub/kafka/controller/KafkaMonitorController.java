package hub.kafka.controller;

import hub.kafka.dto.request.KafkaDlqReplayRequest;
import hub.kafka.dto.response.KafkaDlqMessageResponse;
import hub.kafka.dto.response.KafkaDlqReplayResponse;
import hub.kafka.dto.response.KafkaJobDistributionResponse;
import hub.kafka.dto.response.KafkaMonitorResponse;
import hub.kafka.service.KafkaMonitorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @PostMapping("/dlq/replay")
    public ResponseEntity<KafkaDlqReplayResponse> replayDlqMessage(
            @RequestBody KafkaDlqReplayRequest request
    ) {
        return ResponseEntity.ok(kafkaMonitorService.replayDlqMessage(request));
    }
}
