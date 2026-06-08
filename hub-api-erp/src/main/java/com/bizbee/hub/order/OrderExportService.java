package com.bizbee.hub.order;

public interface OrderExportService {

    OrderExportResponse getOrders(String channelCd, String frDt, String toDt, int page, int size);

    OrderExportResponse getOrdersForUser(Long userId, String channelCd, String frDt, String toDt, int page, int size);
}
