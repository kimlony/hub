package hub.order.service;

import hub.order.dto.response.OrderExportResponse;

public interface OrderExportService {

    OrderExportResponse getOrders(String channelCd, String frDt, String toDt, int page, int size);

    OrderExportResponse getOrdersForUser(Long userId, String channelCd, String frDt, String toDt, int page, int size);

    OrderExportResponse getOrdersForUser(
            Long userId,
            String channelCd,
            String orderStatus,
            String keyword,
            String frDt,
            String toDt,
            int page,
            int size
    );
}
