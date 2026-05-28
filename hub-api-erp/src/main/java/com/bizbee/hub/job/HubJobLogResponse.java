package com.bizbee.hub.job;

import java.util.List;

public record HubJobLogResponse(
        String requestId,
        List<HubJobLogItem> logs
) {
}
