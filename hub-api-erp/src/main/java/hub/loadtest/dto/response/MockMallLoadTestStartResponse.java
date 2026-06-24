package hub.loadtest.dto.response;

import java.util.List;

public record MockMallLoadTestStartResponse(
        String runId,
        String scenario,
        int orders,
        int pageSize,
        int totalPages,
        List<String> requestIds
) {
}
