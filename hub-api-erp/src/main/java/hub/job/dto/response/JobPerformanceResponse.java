package hub.job.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record JobPerformanceResponse(
        Integer minutes,
        JobPerformanceSummary summary,
        List<JobPerformancePoint> points,
        LocalDateTime generatedAt
) {
}
