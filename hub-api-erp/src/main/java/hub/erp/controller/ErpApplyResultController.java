package hub.erp.controller;

import hub.auth.HubUserPrincipal;
import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.dto.response.ErpApplyResultDetailResponse;
import hub.erp.dto.response.ErpApplyResultListResponse;
import hub.erp.service.ErpApplyResultService;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/erp/apply-results")
@RequiredArgsConstructor
public class ErpApplyResultController {
    private final ErpApplyResultService service;

    @GetMapping
    public ResponseEntity<ErpApplyResultListResponse> getResults(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @RequestParam(defaultValue = "") String erpConnectionId,
            @RequestParam(defaultValue = "") String status,
            @RequestParam(defaultValue = "") String operation,
            @RequestParam(defaultValue = "") String requestId,
            @RequestParam(defaultValue = "") String correlationId,
            @RequestParam(required = false) Long normalizedOrderId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        var condition = new ErpApplyResultSearchCondition(principal.corpId(), erpConnectionId, status, operation,
                requestId, correlationId, normalizedOrderId, fromDate, toDate, size, 0);
        return ResponseEntity.ok(service.getResults(condition, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ErpApplyResultDetailResponse> getResult(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @PathVariable long id
    ) {
        return ResponseEntity.ok(service.getResult(principal.corpId(), id));
    }
}
