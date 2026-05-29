package com.bizbee.hub.schedule;

import java.util.List;

public record CollectScheduleListResponse(
        List<CollectScheduleResponse> schedules
) {
}
