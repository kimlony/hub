package hub.erp;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.erp.domain.ErpApplyResult;
import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.mapper.ErpApplyResultMapper;
import hub.erp.service.ErpApplyResultServiceImpl;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ErpApplyResultServiceImplTest {
    private final ErpApplyResultMapper mapper = mock(ErpApplyResultMapper.class);
    private final ErpApplyResultServiceImpl service = new ErpApplyResultServiceImpl(mapper, new ObjectMapper());

    @Test
    void listsResultsWithStatusCorrelationAndTenantScope() {
        ErpApplyResult row = result();
        when(mapper.selectList(org.mockito.ArgumentMatchers.any())).thenReturn(List.of(row));
        when(mapper.selectCount(org.mockito.ArgumentMatchers.any())).thenReturn(1L);
        var requested = new ErpApplyResultSearchCondition(100L, "MOCK-100", "FAILED", "CREATE",
                "erp-1", "corr-1", 11L, null, null, 999, 0);

        var response = service.getResults(requested, 2, 999);

        ArgumentCaptor<ErpApplyResultSearchCondition> captor =
                ArgumentCaptor.forClass(ErpApplyResultSearchCondition.class);
        verify(mapper).selectList(captor.capture());
        assertThat(captor.getValue()).satisfies(condition -> {
            assertThat(condition.corpId()).isEqualTo(100L);
            assertThat(condition.status()).isEqualTo("FAILED");
            assertThat(condition.correlationId()).isEqualTo("corr-1");
            assertThat(condition.size()).isEqualTo(200);
            assertThat(condition.offset()).isEqualTo(200);
        });
        assertThat(response.totalCount()).isEqualTo(1);
        assertThat(response.results().get(0).errorCode()).isEqualTo("ERP_500");
    }

    @Test
    void getsDetailWithOriginalRequestAndResponsePayload() {
        ErpApplyResult row = result();
        when(mapper.selectByIdAndCorpId(1L, 100L)).thenReturn(row);

        var response = service.getResult(1L, 100L);

        assertThat(response.result().requestId()).isEqualTo("erp-1");
        assertThat(response.requestPayload().get("orderId").asLong()).isEqualTo(11L);
        assertThat(response.responsePayload().get("accepted").asBoolean()).isTrue();
        assertThat(response.payloadSummary().requestBytes()).isPositive();
        verify(mapper).selectByIdAndCorpId(1L, 100L);
    }

    private ErpApplyResult result() {
        ErpApplyResult row = new ErpApplyResult();
        row.setId(1L);
        row.setRequestId("erp-1");
        row.setCorrelationId("corr-1");
        row.setNormalizedOrderId(11L);
        row.setErpConnectionId("MOCK-100");
        row.setOperation("CREATE");
        row.setStatus("FAILED");
        row.setIdempotencyKey("idem-1");
        row.setErrorCode("ERP_500");
        row.setErrorMessage("failed");
        row.setAttemptCount(2);
        row.setRequestPayload("{\"orderId\":11}");
        row.setResponsePayload("{\"accepted\":true}");
        row.setCreatedAt(LocalDateTime.now());
        row.setUpdatedAt(LocalDateTime.now());
        return row;
    }
}
