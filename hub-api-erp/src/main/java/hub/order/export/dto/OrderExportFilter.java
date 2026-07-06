package hub.order.export.dto;

public record OrderExportFilter(
        String frDt,
        String toDt,
        String channelCd,
        String mallKey,
        String orderStatus,
        String claimStatus,
        String deliveryStatus
) {
}
