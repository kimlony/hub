package hub.job.dto.response;

import java.util.List;

public record HubJobLogResponse(
        String requestId,
        List<HubJobLogItem> logs
) {
}
