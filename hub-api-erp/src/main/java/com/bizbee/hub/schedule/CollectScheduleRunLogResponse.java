package com.bizbee.hub.schedule;

import java.util.List;

public record CollectScheduleRunLogResponse(
        Long id,
        Long scheduleId,
        String scheduleName,
        String status,
        List<String> mallKeys,
        String dateRangeType,
        String frDt,
        String toDt,
        Integer jobCount,
        List<String> requestIds,
        String errorMessage,
        String startedAt,
        String finishedAt,
        String createdAt
) {
}
