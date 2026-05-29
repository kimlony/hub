package com.bizbee.hub.schedule;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Getter
@Setter
public class CollectScheduleRow {
    private Long id;
    private Long userId;
    private String username;
    private String scheduleName;
    private String mallKeysJson;
    private String dateRangeType;
    private LocalTime runTime;
    private String runTimeText;
    private String enabledYn;
    private String runningYn;
    private LocalDateTime nextRunAtValue;
    private String lastRunAt;
    private String nextRunAt;
    private String lastErrorMessage;
    private String createdAt;
    private String updatedAt;
}
