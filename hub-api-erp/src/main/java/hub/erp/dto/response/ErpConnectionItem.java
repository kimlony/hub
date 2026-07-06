package hub.erp.dto.response;

public record ErpConnectionItem(
        String erpConnectionId,
        String erpType,
        String authType
) {
}