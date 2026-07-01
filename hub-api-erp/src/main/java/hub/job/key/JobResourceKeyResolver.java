package hub.job.key;

import hub.job.event.HubJobEvent;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class JobResourceKeyResolver {

    public String resolvePartitionKey(HubJobEvent event) {
        Object sourceRequestId = event.payload().get("sourceRequestId");
        if ("ORDER_NORMALIZE".equals(event.jobType()) && hasValue(sourceRequestId)) {
            return String.valueOf(sourceRequestId);
        }

        String resourceKey = resolveResourceKey(event.payload());
        return resourceKey != null ? resourceKey : event.requestId();
    }

    public String resolveResourceKey(Map<String, Object> payload) {
        String tenant = tenantKey(payload);
        Object erpConnectionId = payload.get("erpConnectionId");
        if (hasValue(erpConnectionId)) {
            return "erp-connection:" + tenant + ":" + erpConnectionId;
        }

        Object sourceSystem = payload.get("sourceSystem");
        Object sourceAccountId = payload.get("sourceAccountId");
        if (hasValue(sourceSystem) && hasValue(sourceAccountId)) {
            return "source-account:" + tenant + ":" + sourceSystem + ":" + sourceAccountId;
        }

        Object channelAccountId = payload.get("channelAccountId");
        if (hasValue(channelAccountId)) {
            return "channel-account:" + tenant + ":" + channelAccountId;
        }
        return null;
    }

    private String tenantKey(Map<String, Object> payload) {
        Object tenantId = payload.get("tenantId");
        if (hasValue(tenantId)) {
            return String.valueOf(tenantId);
        }
        Object corpId = payload.get("corpId");
        return hasValue(corpId) ? String.valueOf(corpId) : "legacy";
    }

    private boolean hasValue(Object value) {
        return value != null && (!(value instanceof String text) || !text.isBlank());
    }
}
