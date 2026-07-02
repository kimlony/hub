package hub.erp.dto.request;

import java.time.LocalDateTime;

public record ErpApplyResultSearchCondition(
        Long corpId,
        String erpConnectionId,
        String status,
        String operation,
        String requestId,
        String correlationId,
        Long normalizedOrderId,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        int size,
        int offset
) {
}
