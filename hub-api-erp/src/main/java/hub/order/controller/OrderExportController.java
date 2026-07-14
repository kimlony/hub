package hub.order.controller;

import hub.auth.AuthException;
import hub.auth.HubUserPrincipal;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.order.dto.response.OrderExportResponse;
import hub.order.service.OrderExportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/orders")
@RequiredArgsConstructor
public class OrderExportController {

    private final OrderExportService orderExportService;
    private final UserMapper userMapper;

    @GetMapping("/export")
    public ResponseEntity<OrderExportResponse> exportOrders(
            @AuthenticationPrincipal HubUserPrincipal principal,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "") String orderStatus,
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "") String frDt,
            @RequestParam(defaultValue = "") String toDt,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        HubUser user = userMapper.findByUsername(principal.username())
                .orElseThrow(() -> new AuthException("user not found"));
        return ResponseEntity.ok(orderExportService.getOrdersForUser(
                user.getId(),
                channelCd,
                orderStatus,
                keyword,
                frDt,
                toDt,
                page,
                size
        ));
    }
}
