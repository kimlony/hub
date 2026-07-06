package hub.erp.dto.response;

import java.util.List;

public record ManualErpApplyCandidateResponse(
        List<ManualErpApplyCandidateItem> candidates,
        long totalCount,
        int page,
        int size
) {
}