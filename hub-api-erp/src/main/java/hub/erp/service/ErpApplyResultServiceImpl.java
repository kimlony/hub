package hub.erp.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.erp.ErpApplyResultNotFoundException;
import hub.erp.domain.ErpApplyResult;
import hub.erp.dto.request.ErpApplyResultSearchCondition;
import hub.erp.dto.response.ErpApplyResultDetailResponse;
import hub.erp.dto.response.ErpApplyResultItem;
import hub.erp.dto.response.ErpApplyResultListResponse;
import hub.erp.mapper.ErpApplyResultMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ErpApplyResultServiceImpl implements ErpApplyResultService {
    private static final int MAX_PAGE_SIZE = 200;
    private final ErpApplyResultMapper mapper;
    private final ObjectMapper objectMapper;

    @Override
    public ErpApplyResultListResponse getResults(ErpApplyResultSearchCondition requested, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        if (requested.corpId() == null) {
            throw new IllegalArgumentException("corpId is required");
        }
        ErpApplyResultSearchCondition condition = new ErpApplyResultSearchCondition(
                requested.corpId(), blankToNull(requested.erpConnectionId()), blankToNull(requested.status()),
                blankToNull(requested.operation()), blankToNull(requested.requestId()),
                blankToNull(requested.correlationId()), requested.normalizedOrderId(), requested.fromDate(),
                requested.toDate(), safeSize, (safePage - 1) * safeSize);
        List<ErpApplyResultItem> results = mapper.selectList(condition).stream().map(this::toItem).toList();
        return new ErpApplyResultListResponse(results, mapper.selectCount(condition), safePage, safeSize);
    }

    @Override
    public ErpApplyResultDetailResponse getResult(long corpId, long id) {
        ErpApplyResult result = mapper.selectByIdAndCorpId(id, corpId);
        if (result == null) {
            throw new ErpApplyResultNotFoundException(id);
        }
        String request = jsonOrEmpty(result.getRequestPayload());
        String response = jsonOrEmpty(result.getResponsePayload());
        return new ErpApplyResultDetailResponse(
                toItem(result),
                new ErpApplyResultDetailResponse.PayloadSummary(bytes(request), bytes(response)),
                parseJson(request), parseJson(response));
    }

    private ErpApplyResultItem toItem(ErpApplyResult row) {
        return new ErpApplyResultItem(row.getId(), row.getRequestId(), row.getCorrelationId(),
                row.getNormalizedOrderId(), row.getErpConnectionId(), row.getOperation(), row.getStatus(),
                row.getIdempotencyKey(), row.getErpDocumentNo(), row.getErrorCode(), row.getErrorMessage(),
                row.getAttemptCount(), row.getAppliedAt(), row.getCreatedAt(), row.getUpdatedAt());
    }

    private JsonNode parseJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored ERP payload is not valid JSON", exception);
        }
    }

    private String jsonOrEmpty(String value) {
        return value == null || value.isBlank() ? "{}" : value;
    }

    private int bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
