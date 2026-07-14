package hub.job.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import hub.auth.HubUserPrincipal;
import hub.config.JwtAuthFilter;
import hub.config.SecurityConfig;
import hub.exception.HubJobNotFoundException;
import hub.external.ExternalApiAuthFilter;
import hub.job.dto.response.JobPipelineResponse;
import hub.job.service.JobPipelineService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

/**
 * Security/API-key filter classes are excluded from this slice so the test only exercises
 * request binding, service delegation, and JSON serialization for the controller itself.
 */
@WebMvcTest(
        controllers = JobPipelineController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                SecurityConfig.class, JwtAuthFilter.class, ExternalApiAuthFilter.class
        })
)
@AutoConfigureMockMvc(addFilters = false)
class JobPipelineControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JobPipelineService service;

    @BeforeEach
    void setAuthentication() {
        SecurityContextHolder.getContext().setAuthentication(hubAuthentication());
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    private JobPipelineResponse failedErpApplyPipeline() {
        List<JobPipelineResponse.PipelineJobItem> jobs = List.of(
                new JobPipelineResponse.PipelineJobItem("collect-1", "ORDER_COLLECT", "SUCCESS", null, null,
                        0, null, LocalDateTime.of(2026, 7, 1, 9, 0), LocalDateTime.of(2026, 7, 1, 9, 1)),
                new JobPipelineResponse.PipelineJobItem("normalize-1", "ORDER_NORMALIZE", "SUCCESS", "collect-1",
                        "collect-1", 0, null, LocalDateTime.of(2026, 7, 1, 9, 2), LocalDateTime.of(2026, 7, 1, 9, 3)),
                new JobPipelineResponse.PipelineJobItem("erp-apply-1", "ERP_APPLY", "FAILED", "normalize-1",
                        "normalize-1", 3, "Mock ERP apply failed",
                        LocalDateTime.of(2026, 7, 1, 9, 4), LocalDateTime.of(2026, 7, 1, 9, 10))
        );
        List<JobPipelineResponse.PipelineErpApplyResultItem> erpResults = List.of(
                new JobPipelineResponse.PipelineErpApplyResultItem("erp-apply-1", 501L, "FAILED", null,
                        "ERP_500", "Mock ERP apply failed")
        );
        return new JobPipelineResponse("corr-1", "collect-1", "ERP_APPLY", "ERP_APPLY", true, "ERP_APPLY",
                jobs, erpResults);
    }

    @Test
    void returnsOrderedJobChainWithErpApplyFailedStage() throws Exception {
        when(service.getPipeline(100L, "erp-apply-1")).thenReturn(failedErpApplyPipeline());

        mockMvc.perform(get("/api/hub/jobs/erp-apply-1/pipeline").with(authentication(hubAuthentication())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.correlationId").value("corr-1"))
                .andExpect(jsonPath("$.rootJobId").value("collect-1"))
                .andExpect(jsonPath("$.currentStage").value("ERP_APPLY"))
                .andExpect(jsonPath("$.failedStage").value("ERP_APPLY"))
                .andExpect(jsonPath("$.retryable").value(true))
                .andExpect(jsonPath("$.retryFromJobType").value("ERP_APPLY"))
                .andExpect(jsonPath("$.jobs.length()").value(3))
                .andExpect(jsonPath("$.jobs[0].jobType").value("ORDER_COLLECT"))
                .andExpect(jsonPath("$.jobs[0].status").value("SUCCESS"))
                .andExpect(jsonPath("$.jobs[1].jobType").value("ORDER_NORMALIZE"))
                .andExpect(jsonPath("$.jobs[1].parentJobId").value("collect-1"))
                .andExpect(jsonPath("$.jobs[2].jobType").value("ERP_APPLY"))
                .andExpect(jsonPath("$.jobs[2].status").value("FAILED"))
                .andExpect(jsonPath("$.jobs[2].retryCount").value(3))
                .andExpect(jsonPath("$.erpApplyResults.length()").value(1))
                .andExpect(jsonPath("$.erpApplyResults[0].requestId").value("erp-apply-1"))
                .andExpect(jsonPath("$.erpApplyResults[0].normalizedOrderId").value(501))
                .andExpect(jsonPath("$.erpApplyResults[0].status").value("FAILED"))
                .andExpect(jsonPath("$.erpApplyResults[0].errorCode").value("ERP_500"))
                .andExpect(jsonPath("$.erpApplyResults[0].errorMessage").value("Mock ERP apply failed"));

        verify(service).getPipeline(100L, "erp-apply-1");
    }

    @Test
    void missingRequestIdReturns404ViaGlobalExceptionHandler() throws Exception {
        when(service.getPipeline(100L, "missing-1")).thenThrow(new HubJobNotFoundException("missing-1"));

        mockMvc.perform(get("/api/hub/jobs/missing-1/pipeline").with(authentication(hubAuthentication())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"));

        verify(service).getPipeline(100L, "missing-1");
    }

    private static UsernamePasswordAuthenticationToken hubAuthentication() {
        return new UsernamePasswordAuthenticationToken(
                new HubUserPrincipal(1L, 100L, "user", "USER"), null, List.of());
    }
}
