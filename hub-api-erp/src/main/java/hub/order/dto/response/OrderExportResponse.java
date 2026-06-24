package hub.order.dto.response;

import java.util.List;

public record OrderExportResponse(
        int responseCode,
        List<OrderExportItem> orders,
        long total,
        int page,
        int size,
        String generatedAt
) {
}
