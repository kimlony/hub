package hub.erp.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.config.HubApiKeyInterceptor;
import hub.config.JwtAuthFilter;
import hub.config.SecurityConfig;
import hub.config.WebConfig;
import hub.erp.ErpApplyResultNotFoundException;
import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.dto.response.ErpApplyResultDetailResponse;
import hub.erp.dto.response.ErpApplyResultItem;
import hub.erp.dto.response.ErpApplyResultListResponse;
import hub.erp.service.ErpApplyResultService;
import hub.external.ExternalApiAuthFilter;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Security/API-key filter classes are excluded from this slice so the test only exercises
 * request binding, service delegation, and JSON serialization for the controller itself.
 */
@WebMvcTest(
        controllers = ErpApplyResultController.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                SecurityConfig.class, WebConfig.class, JwtAuthFilter.class,
                ExternalApiAuthFilter.class, HubApiKeyInterceptor.class
        })
)
@AutoConfigureMockMvc(addFilters = false)
class ErpApplyResultControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ErpApplyResultService service;

    private ErpApplyResultItem sampleItem() {
        return new ErpApplyResultItem(1L, "erp-apply-1", "corr-1", 501L, "MOCK-1", "CREATE", "FAILED",
                "MOCK-1:CREATE:501", null, "ERP_500", "Mock ERP apply failed", 3, null,
                OffsetDateTime.of(2026, 7, 1, 10, 0, 0, 0, ZoneOffset.UTC),
                OffsetDateTime.of(2026, 7, 1, 10, 5, 0, 0, ZoneOffset.UTC));
    }

    @Test
    void bindsAllListFiltersAndReturnsExpectedJsonShape() throws Exception {
        ErpApplyResultListResponse response = new ErpApplyResultListResponse(List.of(sampleItem()), 1L, 2, 10);
        when(service.getResults(any(), eq(2), eq(10))).thenReturn(response);

        mockMvc.perform(get("/api/hub/erp/apply-results")
                        .param("corpId", "100")
                        .param("status", "FAILED")
                        .param("operation", "CREATE")
                        .param("requestId", "erp-apply-1")
                        .param("correlationId", "corr-1")
                        .param("erpConnectionId", "MOCK-1")
                        .param("normalizedOrderId", "501")
                        .param("fromDate", "2026-07-01T00:00:00")
                        .param("toDate", "2026-07-02T00:00:00")
                        .param("page", "2")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].id").value(1))
                .andExpect(jsonPath("$.results[0].requestId").value("erp-apply-1"))
                .andExpect(jsonPath("$.results[0].correlationId").value("corr-1"))
                .andExpect(jsonPath("$.results[0].normalizedOrderId").value(501))
                .andExpect(jsonPath("$.results[0].erpConnectionId").value("MOCK-1"))
                .andExpect(jsonPath("$.results[0].operation").value("CREATE"))
                .andExpect(jsonPath("$.results[0].status").value("FAILED"))
                .andExpect(jsonPath("$.results[0].idempotencyKey").value("MOCK-1:CREATE:501"))
                .andExpect(jsonPath("$.results[0].errorCode").value("ERP_500"))
                .andExpect(jsonPath("$.results[0].errorMessage").value("Mock ERP apply failed"))
                .andExpect(jsonPath("$.results[0].attemptCount").value(3))
                .andExpect(jsonPath("$.totalCount").value(1))
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.size").value(10));

        ArgumentCaptor<ErpApplyResultSearchCondition> captor =
                ArgumentCaptor.forClass(ErpApplyResultSearchCondition.class);
        verify(service).getResults(captor.capture(), eq(2), eq(10));
        ErpApplyResultSearchCondition condition = captor.getValue();
        assertThat(condition.corpId()).isEqualTo(100L);
        assertThat(condition.status()).isEqualTo("FAILED");
        assertThat(condition.operation()).isEqualTo("CREATE");
        assertThat(condition.requestId()).isEqualTo("erp-apply-1");
        assertThat(condition.correlationId()).isEqualTo("corr-1");
        assertThat(condition.erpConnectionId()).isEqualTo("MOCK-1");
        assertThat(condition.normalizedOrderId()).isEqualTo(501L);
        assertThat(condition.fromDate()).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
        assertThat(condition.toDate()).isEqualTo(LocalDateTime.of(2026, 7, 2, 0, 0));
    }

    @Test
    void usesDefaultPageAndSizeWhenNotProvided() throws Exception {
        when(service.getResults(any(), eq(1), eq(20)))
                .thenReturn(new ErpApplyResultListResponse(List.of(), 0, 1, 20));

        mockMvc.perform(get("/api/hub/erp/apply-results").param("corpId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results").isArray())
                .andExpect(jsonPath("$.totalCount").value(0))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(20));

        verify(service).getResults(any(), eq(1), eq(20));
    }

    /**
     * corpId is a required @RequestParam with no default, so a missing value throws
     * MissingServletRequestParameterException, which GlobalExceptionHandler now maps to 400.
     */
    @Test
    void missingRequiredCorpIdReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/hub/erp/apply-results"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Required request parameter 'corpId' (Long) is missing"))
                .andExpect(jsonPath("$.parameterName").value("corpId"))
                .andExpect(jsonPath("$.requiredType").value("Long"));
    }

    @Test
    void invalidCorpIdTypeReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/hub/erp/apply-results").param("corpId", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.parameterName").value("corpId"))
                .andExpect(jsonPath("$.rejectedValue").value("abc"))
                .andExpect(jsonPath("$.requiredType").value("Long"))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("corpId")))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("abc")));
    }

    @Test
    void invalidNormalizedOrderIdTypeReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/hub/erp/apply-results")
                        .param("corpId", "1")
                        .param("normalizedOrderId", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.parameterName").value("normalizedOrderId"))
                .andExpect(jsonPath("$.rejectedValue").value("abc"))
                .andExpect(jsonPath("$.requiredType").value("Long"))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("normalizedOrderId")))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("abc")));
    }

    @Test
    void invalidPageTypeReturnsBadRequest() throws Exception {
        mockMvc.perform(get("/api/hub/erp/apply-results")
                        .param("corpId", "1")
                        .param("page", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.parameterName").value("page"))
                .andExpect(jsonPath("$.rejectedValue").value("abc"))
                .andExpect(jsonPath("$.requiredType").value("int"))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("page")))
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("abc")));
    }

    @Test
    void detailReturnsPayloadsAndSummaryFor200() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode requestPayload = mapper.readTree("{\"erpConnectionId\":\"MOCK-1\",\"orders\":[501]}");
        JsonNode responsePayload = mapper.readTree("{\"errorCode\":\"ERP_500\"}");
        ErpApplyResultDetailResponse detail = new ErpApplyResultDetailResponse(sampleItem(),
                new ErpApplyResultDetailResponse.PayloadSummary(42, 21), requestPayload, responsePayload);
        when(service.getResult(1L, 100L)).thenReturn(detail);

        mockMvc.perform(get("/api/hub/erp/apply-results/1").param("corpId", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.id").value(1))
                .andExpect(jsonPath("$.result.requestId").value("erp-apply-1"))
                .andExpect(jsonPath("$.requestPayload.erpConnectionId").value("MOCK-1"))
                .andExpect(jsonPath("$.requestPayload.orders[0]").value(501))
                .andExpect(jsonPath("$.responsePayload.errorCode").value("ERP_500"))
                .andExpect(jsonPath("$.payloadSummary.requestBytes").value(42))
                .andExpect(jsonPath("$.payloadSummary.responseBytes").value(21));

        verify(service).getResult(1L, 100L);
    }

    @Test
    void detailReturns404WhenResultNotFound() throws Exception {
        when(service.getResult(999L, 100L)).thenThrow(new ErpApplyResultNotFoundException(999L));

        mockMvc.perform(get("/api/hub/erp/apply-results/999").param("corpId", "100"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.error").value("Not Found"))
                .andExpect(jsonPath("$.message").value("ERP apply result not found for id: 999"));
    }
}
