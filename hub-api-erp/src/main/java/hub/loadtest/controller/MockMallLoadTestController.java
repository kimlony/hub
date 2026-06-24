package hub.loadtest.controller;

import hub.loadtest.dto.request.MockMallLoadTestRequest;
import hub.loadtest.dto.response.MockMallLoadTestStartResponse;
import hub.loadtest.dto.response.MockMallLoadTestStatusResponse;
import hub.loadtest.service.MockMallLoadTestService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/load-tests")
@RequiredArgsConstructor
public class MockMallLoadTestController {

    private final MockMallLoadTestService mockMallLoadTestService;

    @PostMapping("/mock-mall")
    public ResponseEntity<MockMallLoadTestStartResponse> startMockMallLoadTest(
            @AuthenticationPrincipal String username,
            @RequestBody MockMallLoadTestRequest request
    ) {
        return ResponseEntity.ok(mockMallLoadTestService.start(username, request));
    }

    @GetMapping
    public ResponseEntity<List<MockMallLoadTestStatusResponse.RunSummary>> getHistory() {
        return ResponseEntity.ok(mockMallLoadTestService.history());
    }

    @GetMapping("/{runId}")
    public ResponseEntity<MockMallLoadTestStatusResponse> getStatus(@PathVariable String runId) {
        return ResponseEntity.ok(mockMallLoadTestService.status(runId));
    }
}
