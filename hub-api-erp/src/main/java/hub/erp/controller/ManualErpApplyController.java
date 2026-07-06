package hub.erp.controller;

import hub.erp.dto.request.ManualErpApplyRequest;
import hub.erp.dto.response.ErpConnectionItem;
import hub.erp.dto.response.ManualErpApplyCandidateResponse;
import hub.erp.dto.response.ManualErpApplyResponse;
import hub.erp.service.ManualErpApplyService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/erp")
@RequiredArgsConstructor
public class ManualErpApplyController {

    private final ManualErpApplyService service;

    @GetMapping("/connections")
    public ResponseEntity<List<ErpConnectionItem>> getConnections(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(service.getActiveConnections(username));
    }

    @GetMapping("/apply-candidates")
    public ResponseEntity<ManualErpApplyCandidateResponse> getCandidates(
            @AuthenticationPrincipal String username,
            @RequestParam(defaultValue = "") String erpConnectionId,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "") String erpStatus,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "30") int size
    ) {
        return ResponseEntity.ok(service.getCandidates(username, erpConnectionId, channelCd, erpStatus, page, size));
    }

    @PostMapping("/apply-requests")
    public ResponseEntity<ManualErpApplyResponse> requestApply(
            @AuthenticationPrincipal String username,
            @Valid @RequestBody ManualErpApplyRequest request
    ) {
        return ResponseEntity.ok(service.requestApply(username, request));
    }
}