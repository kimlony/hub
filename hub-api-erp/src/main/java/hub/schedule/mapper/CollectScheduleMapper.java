package hub.schedule.mapper;

import hub.schedule.domain.CollectScheduleRow;
import hub.schedule.domain.CollectScheduleRunLogRow;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CollectScheduleMapper {
    List<CollectScheduleRow> findByUserId(@Param("userId") Long userId);
    List<CollectScheduleRunLogRow> findRunLogsByUserId(@Param("userId") Long userId,
                                                       @Param("limit") int limit);
    CollectScheduleRow findByUserIdAndId(@Param("userId") Long userId, @Param("id") Long id);
    void insert(CollectScheduleRow row);
    void insertRunLog(CollectScheduleRunLogRow row);
    int update(CollectScheduleRow row);
    int updateEnabled(@Param("userId") Long userId,
                      @Param("id") Long id,
                      @Param("enabledYn") String enabledYn,
                      @Param("nextRunAt") LocalDateTime nextRunAt);
    int delete(@Param("userId") Long userId, @Param("id") Long id);
    int skipStaleDueSchedules(@Param("maxCatchUpMinutes") int maxCatchUpMinutes);
    List<CollectScheduleRow> claimDueSchedules(@Param("limit") int limit);
    void markRunSuccess(@Param("id") Long id,
                        @Param("nextRunAt") LocalDateTime nextRunAt);
    void markRunFailed(@Param("id") Long id,
                       @Param("nextRunAt") LocalDateTime nextRunAt,
                       @Param("errorMessage") String errorMessage);
    void markRunLogSuccess(@Param("id") Long id,
                           @Param("jobCount") int jobCount,
                           @Param("requestIdsJson") String requestIdsJson);
    void markRunLogFailed(@Param("id") Long id,
                          @Param("errorMessage") String errorMessage);
}
