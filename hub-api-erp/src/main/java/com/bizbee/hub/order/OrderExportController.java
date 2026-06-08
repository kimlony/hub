package com.bizbee.hub.order;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hub/orders")
@RequiredArgsConstructor
public class OrderExportController {

    private final OrderExportService orderExportService;

    @GetMapping("/export")
    public ResponseEntity<OrderExportResponse> exportOrders(
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "") String frDt,
            @RequestParam(defaultValue = "") String toDt,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return ResponseEntity.ok(orderExportService.getOrders(channelCd, frDt, toDt, page, size));
    }
}
