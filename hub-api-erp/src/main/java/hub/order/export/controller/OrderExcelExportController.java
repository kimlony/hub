package hub.order.export.controller;

import hub.order.export.dto.OrderExportFilter;
import hub.order.export.dto.OrderExportHistoryItem;
import hub.order.export.dto.OrderExportPreviewResponse;
import hub.order.export.service.OrderExcelExportService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders/export")
@RequiredArgsConstructor
public class OrderExcelExportController {
    private static final MediaType XLSX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private final OrderExcelExportService service;

    @GetMapping("/preview")
    public ResponseEntity<OrderExportPreviewResponse> preview(
            @AuthenticationPrincipal String username,
            @RequestParam(defaultValue = "") String frDt,
            @RequestParam(defaultValue = "") String toDt,
            @RequestParam(defaultValue = "") String channelCd,
            @RequestParam(defaultValue = "") String mallKey,
            @RequestParam(defaultValue = "") String orderStatus,
            @RequestParam(defaultValue = "") String claimStatus,
            @RequestParam(defaultValue = "") String deliveryStatus
    ) {
        return ResponseEntity.ok(service.preview(username,
                filter(frDt, toDt, channelCd, mallKey, orderStatus, claimStatus, deliveryStatus)));
    }

    @PostMapping("/excel")
    public ResponseEntity<byte[]> excel(
            @AuthenticationPrincipal String username,
            @RequestBody OrderExportFilter filter
    ) {
        OrderExcelExportService.ExportedFile file = service.export(username, filter);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(file.fileName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(XLSX)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Export-Id", file.exportId())
                .contentLength(file.content().length)
                .body(file.content());
    }

    @GetMapping("/history")
    public ResponseEntity<List<OrderExportHistoryItem>> history(@AuthenticationPrincipal String username) {
        return ResponseEntity.ok(service.history(username));
    }

    private OrderExportFilter filter(String frDt, String toDt, String channelCd, String mallKey,
                                     String orderStatus, String claimStatus, String deliveryStatus) {
        return new OrderExportFilter(frDt, toDt, channelCd, mallKey, orderStatus, claimStatus, deliveryStatus);
    }
}
