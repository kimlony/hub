package hub.order.export.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record OrderExcelItem(
        long normalizedOrderId,
        String mallName,
        String mallAccount,
        String orderNo,
        String orderItemNo,
        OffsetDateTime orderDate,
        OffsetDateTime paidAt,
        String buyerName,
        String receiverName,
        String receiverTel,
        String zipCode,
        String address,
        String addressDetail,
        String productCode,
        String productName,
        String optionName,
        Integer quantity,
        BigDecimal salePrice,
        BigDecimal orderAmount,
        BigDecimal deliveryFee,
        String orderStatus,
        String claimStatus,
        String deliveryStatus,
        String deliveryCompany,
        String trackingNumber,
        OffsetDateTime collectedAt,
        String channelCd,
        int itemCount
) {
}
