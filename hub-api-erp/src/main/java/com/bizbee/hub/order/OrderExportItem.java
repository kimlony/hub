package com.bizbee.hub.order;

public record OrderExportItem(
        String requestId,
        String requestKey,
        String jobType,
        String sourceErp,
        String channelCd,
        String frDt,
        String toDt,
        String orderNo,
        String orderStatus,
        String orderDate,
        String receiverName,
        String productName,
        Integer quantity,
        Long orderAmount,
        String rawOrder,
        String savedAt
) {
}
