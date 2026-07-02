package hub.job.dto.response;

import java.time.LocalDateTime;
import java.util.List;

public record JobPipelineResponse(
        String correlationId,
        String rootJobId,
        String currentStage,
        String failedStage,
        boolean retryable,
        String retryFromJobType,
        List<PipelineJobItem> jobs,
        List<PipelineErpApplyResultItem> erpApplyResults
) {
    public record PipelineJobItem(
            String requestId,
            String jobType,
            String status,
            String parentJobId,
            String causationId,
            int retryCount,
            String errorMessage,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
    }

    public record PipelineErpApplyResultItem(
            String requestId,
            Long normalizedOrderId,
            String status,
            String erpDocumentNo,
            String errorCode,
            String errorMessage
    ) {
    }
}
