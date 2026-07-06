package hub.erp.service;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ManualErpApplyKeysTest {

    @Test
    void buildsWorkerCompatibleIdempotencyKeyMaterial() {
        assertThat(ManualErpApplyKeys.idempotencyKeyMaterial("ERP-100", "CREATE", List.of(101L, 102L)))
                .isEqualTo("ERP-100:CREATE:101,102");
    }

    @Test
    void doesNotUseListToStringFormat() {
        assertThat(ManualErpApplyKeys.idempotencyKeyMaterial("ERP-100", "CREATE", List.of(101L, 102L)))
                .isNotEqualTo("ERP-100:CREATE:[101, 102]");
    }

    @Test
    void hashesMaterialWithSha256Hex() {
        String material = ManualErpApplyKeys.idempotencyKeyMaterial("MOCK-100", "CREATE", List.of(11L));
        assertThat(ManualErpApplyKeys.erpApplyIdempotencyKey("MOCK-100", "CREATE", List.of(11L)))
                .isEqualTo(ManualErpApplyKeys.sha256Hex(material));
    }
}
