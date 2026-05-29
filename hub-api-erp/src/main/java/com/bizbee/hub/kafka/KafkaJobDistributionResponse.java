package com.bizbee.hub.kafka;

import java.time.LocalDateTime;
import java.util.List;

public record KafkaJobDistributionResponse(
        Integer minutes,
        List<KafkaJobDistributionSummary> summary,
        List<KafkaJobDistributionItem> recentJobs,
        LocalDateTime generatedAt
) {
}
