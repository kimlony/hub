package hub.schedule.domain;

import java.time.LocalDateTime;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class OrderStatusSyncScheduleRow {
    private Long id;
    private Long userId;
    private String username;
    private String scheduleName;
    private String mallKeysJson;
    private String channelAccountIdsJson;
    private String statusTypesJson;
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
    private String scheduleMode;
    private Integer intervalHours;
}
