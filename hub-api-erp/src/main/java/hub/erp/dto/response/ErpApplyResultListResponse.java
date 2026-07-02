package hub.erp.dto.response;

import java.util.List;

public record ErpApplyResultListResponse(
        List<ErpApplyResultItem> results,
        long totalCount,
        int page,
        int size
) {
}
