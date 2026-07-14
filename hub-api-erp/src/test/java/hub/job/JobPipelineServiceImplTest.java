package hub.job;

import hub.erp.domain.ErpApplyResult;
import hub.erp.mapper.ErpApplyResultMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.mapper.HubJobMapper;
import hub.job.service.JobPipelineServiceImpl;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JobPipelineServiceImplTest {
    private final HubJobMapper jobMapper = mock(HubJobMapper.class);
    private final ErpApplyResultMapper resultMapper = mock(ErpApplyResultMapper.class);
    private final JobPipelineServiceImpl service = new JobPipelineServiceImpl(jobMapper, resultMapper);

    @Test
    void crossTenantRequestIdIsHiddenAsNotFound() {
        when(jobMapper.selectByRequestIdAndCorpId("corp-2-job", 100L)).thenReturn(null);

        assertThatThrownBy(() -> service.getPipeline(100L, "corp-2-job"))
                .isInstanceOf(hub.exception.HubJobNotFoundException.class);

        verify(jobMapper, never()).selectPipelineByCorrelationIdAndCorpId("corr-1", 100L);
    }

    @Test
    void returnsOrderedPipelineAndMarksErpApplyAsFailedStage() {
        HubJob collect = job("collect-1", "ORDER_COLLECT", HubJobStatus.SUCCESS, null, null, 1);
        HubJob normalize = job("normalize-1", "ORDER_NORMALIZE", HubJobStatus.SUCCESS,
                "collect-1", "collect-1", 2);
        HubJob erp = job("erp-1", "ERP_APPLY", HubJobStatus.FAILED,
                "normalize-1", "normalize-1", 3);
        when(jobMapper.selectByRequestIdAndCorpId("erp-1", 100L)).thenReturn(erp);
        when(jobMapper.selectPipelineByCorrelationIdAndCorpId("corr-1", 100L))
                .thenReturn(List.of(erp, collect, normalize));
        ErpApplyResult result = new ErpApplyResult();
        result.setRequestId("erp-1");
        result.setNormalizedOrderId(11L);
        result.setStatus("FAILED");
        result.setErrorCode("ERP_500");
        result.setErrorMessage("Mock ERP apply failed");
        when(resultMapper.selectByCorrelationIdAndCorpId("corr-1", 100L)).thenReturn(List.of(result));

        var response = service.getPipeline(100L, "erp-1");

        assertThat(response.rootJobId()).isEqualTo("collect-1");
        assertThat(response.jobs()).extracting(item -> item.jobType())
                .containsExactly("ORDER_COLLECT", "ORDER_NORMALIZE", "ERP_APPLY");
        assertThat(response.currentStage()).isEqualTo("ERP_APPLY");
        assertThat(response.failedStage()).isEqualTo("ERP_APPLY");
        assertThat(response.retryable()).isTrue();
        assertThat(response.retryFromJobType()).isEqualTo("ERP_APPLY");
        assertThat(response.erpApplyResults().get(0).errorCode()).isEqualTo("ERP_500");
        verify(jobMapper).selectPipelineByCorrelationIdAndCorpId("corr-1", 100L);
    }

    @Test
    void returnsNormalizeAsCurrentStageWhenErpApplyWasNotCreated() {
        HubJob collect = job("collect-2", "ORDER_COLLECT", HubJobStatus.SUCCESS, null, null, 1);
        HubJob normalize = job("normalize-2", "ORDER_NORMALIZE", HubJobStatus.SUCCESS,
                "collect-2", "collect-2", 2);
        when(jobMapper.selectByRequestIdAndCorpId("normalize-2", 100L)).thenReturn(normalize);
        when(jobMapper.selectPipelineByCorrelationIdAndCorpId("corr-1", 100L))
                .thenReturn(List.of(collect, normalize));
        when(resultMapper.selectByCorrelationIdAndCorpId("corr-1", 100L)).thenReturn(List.of());

        var response = service.getPipeline(100L, "normalize-2");

        assertThat(response.currentStage()).isEqualTo("ORDER_NORMALIZE");
        assertThat(response.failedStage()).isNull();
        assertThat(response.retryable()).isFalse();
        assertThat(response.retryFromJobType()).isNull();
        assertThat(response.jobs()).extracting(item -> item.jobType())
                .containsExactly("ORDER_COLLECT", "ORDER_NORMALIZE");
        assertThat(response.erpApplyResults()).isEmpty();
    }
    private HubJob job(String id, String type, HubJobStatus status, String parent, String causation, int minute) {
        return HubJob.builder().requestId(id).jobType(type).status(status).parentJobId(parent)
                .causationId(causation).correlationId("corr-1").retryCount(type.equals("ERP_APPLY") ? 3 : 0)
                .createdAt(LocalDateTime.of(2026, 7, 2, 10, minute)).updatedAt(LocalDateTime.now()).build();
    }
}
