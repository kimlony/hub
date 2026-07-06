package hub.order.export.dto;

import java.util.List;

public record OrderExportPreviewResponse(long totalCount, int previewCount, List<OrderExcelItem> items) {
}
