package hub.job.dto.response;

import java.util.List;

public record HubJobListResponse(
        List<HubJobListItem> jobs,
        int totalCount,
        int page,
        int size
) {
}
