package hub.erp.dto.response;

import com.fasterxml.jackson.databind.JsonNode;

public record ErpApplyResultDetailResponse(
        ErpApplyResultItem result,
        PayloadSummary payloadSummary,
        JsonNode requestPayload,
        JsonNode responsePayload
) {
    public record PayloadSummary(int requestBytes, int responseBytes) {
    }
}
