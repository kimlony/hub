package hub.job.service;

import hub.erp.domain.ErpApplyResult;
import hub.erp.mapper.ErpApplyResultMapper;
import hub.exception.HubJobNotFoundException;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.dto.response.JobPipelineResponse;
import hub.job.mapper.HubJobMapper;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPipelineServiceImpl implements JobPipelineService {
    private final HubJobMapper hubJobMapper;
    private final ErpApplyResultMapper erpApplyResultMapper;

    @Override
    public JobPipelineResponse getPipeline(long corpId, String requestId) {
        HubJob requested = hubJobMapper.selectByRequestIdAndCorpId(requestId, corpId);
        if (requested == null || requested.getCorrelationId() == null) {
            throw new HubJobNotFoundException(requestId);
        }
        List<HubJob> jobs = hubJobMapper.selectPipelineByCorrelationIdAndCorpId(requested.getCorrelationId(), corpId);
        if (jobs.stream().noneMatch(job -> requestId.equals(job.getRequestId()))) {
            throw new HubJobNotFoundException(requestId);
        }
        List<HubJob> ordered = jobs.stream().sorted(Comparator
                .comparingInt((HubJob job) -> stageOrder(job.getJobType()))
                .thenComparing(HubJob::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        HubJob failed = ordered.stream().filter(job -> job.getStatus() == HubJobStatus.FAILED)
                .max(Comparator.comparingInt(job -> stageOrder(job.getJobType()))).orElse(null);
        HubJob current = failed != null ? failed : ordered.stream()
                .filter(job -> job.getStatus() != HubJobStatus.SUCCESS)
                .max(Comparator.comparingInt(job -> stageOrder(job.getJobType())))
                .orElseGet(() -> ordered.get(ordered.size() - 1));
        String rootJobId = ordered.stream().filter(job -> job.getParentJobId() == null)
                .map(HubJob::getRequestId).findFirst().orElse(ordered.get(0).getRequestId());
        List<JobPipelineResponse.PipelineJobItem> jobItems = ordered.stream().map(this::toJobItem).toList();
        List<JobPipelineResponse.PipelineErpApplyResultItem> erpItems = erpApplyResultMapper
                .selectByCorrelationIdAndCorpId(requested.getCorrelationId(), corpId)
                .stream().map(this::toErpItem).toList();
        return new JobPipelineResponse(requested.getCorrelationId(), rootJobId, current.getJobType(),
                failed == null ? null : failed.getJobType(), failed != null,
                failed == null ? null : failed.getJobType(), jobItems, erpItems);
    }

    private JobPipelineResponse.PipelineJobItem toJobItem(HubJob job) {
        return new JobPipelineResponse.PipelineJobItem(job.getRequestId(), job.getJobType(),
                job.getStatus().name(), job.getParentJobId(), job.getCausationId(), job.getRetryCount(),
                job.getErrorMessage(), job.getCreatedAt(), job.getUpdatedAt());
    }

    private JobPipelineResponse.PipelineErpApplyResultItem toErpItem(ErpApplyResult result) {
        return new JobPipelineResponse.PipelineErpApplyResultItem(result.getRequestId(),
                result.getNormalizedOrderId(), result.getStatus(), result.getErpDocumentNo(),
                result.getErrorCode(), result.getErrorMessage());
    }

    private int stageOrder(String jobType) {
        return switch (jobType) {
            case "ORDER_COLLECT" -> 10;
            case "ORDER_NORMALIZE" -> 20;
            case "ERP_APPLY" -> 30;
            default -> 100;
        };
    }
}
