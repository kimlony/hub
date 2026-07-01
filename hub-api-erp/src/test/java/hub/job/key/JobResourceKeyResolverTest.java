package hub.job.key;

import hub.job.event.HubJobEvent;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JobResourceKeyResolverTest {

    private final JobResourceKeyResolver resolver = new JobResourceKeyResolver();

    @Test
    void resolvesChannelAccountRegardlessOfJobType() {
        Map<String, Object> payload = Map.of("corpId", 100, "channelAccountId", 10);
        assertThat(resolver.resolvePartitionKey(event("ORDER_COLLECT", payload)))
                .isEqualTo("channel-account:100:10");
        assertThat(resolver.resolvePartitionKey(event("ORDER_STATUS_SYNC", payload)))
                .isEqualTo("channel-account:100:10");
    }

    @Test
    void preservesSourceRequestKeyForNormalize() {
        assertThat(resolver.resolvePartitionKey(event("ORDER_NORMALIZE", Map.of(
                "corpId", 100,
                "channelAccountId", 10,
                "sourceRequestId", "collect-001"
        )))).isEqualTo("collect-001");
    }

    @Test
    void supportsFutureSourceAccountAndErpConnectionResources() {
        assertThat(resolver.resolvePartitionKey(event("EXTERNAL_ORDER_IMPORT", Map.of(
                "tenantId", "tenant-a",
                "sourceSystem", "SABANGNET",
                "sourceAccountId", "account-1"
        )))).isEqualTo("source-account:tenant-a:SABANGNET:account-1");
        assertThat(resolver.resolvePartitionKey(event("ERP_APPLY", Map.of(
                "corpId", 100,
                "erpConnectionId", 50
        )))).isEqualTo("erp-connection:100:50");
    }

    private HubJobEvent event(String jobType, Map<String, Object> payload) {
        return new HubJobEvent("request-001", "HUB", jobType, "request-key", payload);
    }
}
