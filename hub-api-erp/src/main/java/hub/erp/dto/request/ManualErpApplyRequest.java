package hub.erp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ManualErpApplyRequest(
        @NotBlank String clientRequestId,
        @NotBlank String erpConnectionId,
        @NotEmpty @Size(max = 100) List<Long> normalizedOrderIds,
        String operation,
        @Size(max = 500) String reason
) {
}