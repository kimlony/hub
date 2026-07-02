package hub.erp.dto.response;

import java.time.LocalDateTime;

public record ErpApplyResultItem(
        Long id,
        String requestId,
        String correlationId,
        Long normalizedOrderId,
        String erpConnectionId,
        String operation,
        String status,
        String idempotencyKey,
        String erpDocumentNo,
        String errorCode,
        String errorMessage,
        int attemptCount,
        LocalDateTime appliedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
