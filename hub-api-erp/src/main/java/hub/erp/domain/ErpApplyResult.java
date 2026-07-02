package hub.erp.domain;

import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ErpApplyResult {
    private Long id;
    private String requestId;
    private String correlationId;
    private Long normalizedOrderId;
    private String erpConnectionId;
    private String operation;
    private String status;
    private String idempotencyKey;
    private String erpDocumentNo;
    private String requestPayload;
    private String responsePayload;
    private String errorCode;
    private String errorMessage;
    private int attemptCount;
    private OffsetDateTime appliedAt;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
