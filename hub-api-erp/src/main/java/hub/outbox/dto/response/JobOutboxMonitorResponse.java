package hub.outbox.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record JobOutboxMonitorResponse(
        JobOutboxStats stats,
        List<JobOutboxItem> events,
        String status,
        LocalDateTime generatedAt
) {
}
