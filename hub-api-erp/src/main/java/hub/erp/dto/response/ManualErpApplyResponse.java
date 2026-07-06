package hub.erp.dto.response;

import java.util.List;

public record ManualErpApplyResponse(
        String commandId,
        int requested,
        int accepted,
        int skipped,
        String status,
        List<Long> skippedOrderIds,
        List<JobItem> jobs
) {
    public record JobItem(String requestId, String jobType, String status, String sourceNormalizeJobId, int orderCount) {
    }
}