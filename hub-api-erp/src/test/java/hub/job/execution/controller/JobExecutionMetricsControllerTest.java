package hub.job.execution.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import hub.config.HubApiKeyInterceptor;
import hub.config.JwtAuthFilter;
import hub.config.SecurityConfig;
import hub.config.WebConfig;
import hub.external.ExternalApiAuthFilter;
import hub.job.execution.domain.ClaimSource;
import hub.job.execution.domain.JobAttemptStatus;
import hub.job.execution.dto.response.JobAttemptSummary;
import hub.job.execution.dto.response.JobExecutionMetrics;
import hub.job.execution.service.JobExecutionQueryService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        controllers = JobExecutionMetricsController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                SecurityConfig.class, WebConfig.class, JwtAuthFilter.class,
                ExternalApiAuthFilter.class, HubApiKeyInterceptor.class
        })
)
@AutoConfigureMockMvc(addFilters = false)
class JobExecutionMetricsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JobExecutionQueryService service;

    @Test
    void exposesAttemptHistoryByJobPrimaryKey() throws Exception {
        OffsetDateTime now = OffsetDateTime.parse("2026-07-13T12:00:00+09:00");
        when(service.getAttempts("job-1")).thenReturn(List.of(new JobAttemptSummary(
                1L, UUID.fromString("00000000-0000-0000-0000-000000000001"), "job-1", "job-1",
                "ORDER_COLLECT", 2L, "worker-a", ClaimSource.RECOVERY, JobAttemptStatus.SUCCESS,
                now.minusMinutes(3), now.plusMinutes(27), now, 180000L, null, null, null
        )));

        mockMvc.perform(get("/api/admin/jobs/job-1/attempts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].jobId").value("job-1"))
                .andExpect(jsonPath("$[0].claimSource").value("RECOVERY"))
                .andExpect(jsonPath("$[0].status").value("SUCCESS"));

        verify(service).getAttempts("job-1");
    }

    @Test
    void bindsPeriodAndJobTypeForMetrics() throws Exception {
        OffsetDateTime from = OffsetDateTime.parse("2026-07-12T00:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-07-13T00:00:00Z");
        JobExecutionMetrics response = new JobExecutionMetrics(
                from, to, "ORDER_COLLECT", 5, 3, 1, 1, 1, 1.25,
                List.of(new JobExecutionMetrics.JobTypeDuration("ORDER_COLLECT", 300, 480, 496))
        );
        when(service.getMetrics(eq(from), eq(to), eq("ORDER_COLLECT"))).thenReturn(response);

        mockMvc.perform(get("/api/admin/job-execution-metrics")
                        .param("from", "2026-07-12T00:00:00Z")
                        .param("to", "2026-07-13T00:00:00Z")
                        .param("jobType", "ORDER_COLLECT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalAttempts").value(5))
                .andExpect(jsonPath("$.leaseExpiredAttempts").value(1))
                .andExpect(jsonPath("$.durations[0].p95DurationMs").value(480.0))
                .andExpect(jsonPath("$.durations[0].p99DurationMs").value(496.0));

        verify(service).getMetrics(from, to, "ORDER_COLLECT");
    }
}
