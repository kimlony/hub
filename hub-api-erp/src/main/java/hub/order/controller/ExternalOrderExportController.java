package hub.order.controller;

import hub.external.ExternalApiPrincipal;
import hub.order.service.OrderExportService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/external/orders")
@RequiredArgsConstructor
public class ExternalOrderExportController {

    private final OrderExportService orderExportService;

    @GetMapping
    public ResponseEntity<?> exportOrders(
            @AuthenticationPrincipal ExternalApiPrincipal principal,
            @RequestParam(defaultValue = "") String frDt,
            @RequestParam(defaultValue = "") String toDt,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        if (principal == null || principal.userId() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "EXTERNAL_TOKEN_REQUIRED", "message", "?筌? API ??ルㅎ荑???熬곣뫗???紐껊퉵??"));
        }
        if (!principal.hasScope("orders:read")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "INSUFFICIENT_SCOPE", "message", "orders:read 雅?굝??뇡???熬곣뫗???紐껊퉵??"));
        }
        return ResponseEntity.ok(orderExportService.getOrdersForUser(
                principal.userId(), "", frDt, toDt, page, size
        ));
    }
}
