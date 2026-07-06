package hub.erp.dto.response;

public record ManualErpApplyCandidateItem(
        long normalizedOrderId,
        String sourceNormalizeJobId,
        long channelAccountId,
        String channelCd,
        String orderNo,
        String orderStatus,
        String orderDate,
        String erpStatus,
        String erpDocumentNo,
        String errorCode,
        String errorMessage
) {
}