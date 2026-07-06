package hub.order.export.dto;

import java.time.OffsetDateTime;

public record OrderExportHistoryItem(
        String exportId,
        String status,
        String fileName,
        int totalCount,
        OffsetDateTime createdAt,
        OffsetDateTime completedAt,
        String errorMessage
) {
}
