package hub.erp.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/**
 * ERP_APPLY idempotency key helpers aligned with hub-worker auto ERP format:
 * {@code sha256(erpConnectionId + ":" + operation + ":" + orderIds.join(","))}
 */
final class ManualErpApplyKeys {

    private ManualErpApplyKeys() {
    }

    static String orderIdsCsv(List<Long> orderIds) {
        return orderIds.stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    static String idempotencyKeyMaterial(String erpConnectionId, String operation, List<Long> orderIds) {
        return erpConnectionId + ":" + operation + ":" + orderIdsCsv(orderIds);
    }

    static String erpApplyIdempotencyKey(String erpConnectionId, String operation, List<Long> orderIds) {
        return sha256Hex(idempotencyKeyMaterial(erpConnectionId, operation, orderIds));
    }

    static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
