package hub.schedule.domain;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CollectScheduleRunLogRow {
    private Long id;
    private Long scheduleId;
    private Long userId;
    private String scheduleName;
    private String status;
    private String mallKeysJson;
    private String dateRangeType;
    private String frDt;
    private String toDt;
    private Integer jobCount;
    private String requestIdsJson;
    private String errorMessage;
    private String startedAt;
    private String finishedAt;
    private String createdAt;
}
