package hub.schedule.mapper;

import hub.schedule.domain.OrderStatusSyncScheduleRow;
import hub.schedule.domain.OrderStatusSyncScheduleRunLogRow;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OrderStatusSyncScheduleMapper {
    List<OrderStatusSyncScheduleRow> findByUserId(@Param("userId") Long userId);
    List<OrderStatusSyncScheduleRunLogRow> findRunLogsByUserId(@Param("userId") Long userId,
                                                               @Param("limit") int limit);
    OrderStatusSyncScheduleRow findByUserIdAndId(@Param("userId") Long userId, @Param("id") Long id);
    void insert(OrderStatusSyncScheduleRow row);
    void insertRunLog(OrderStatusSyncScheduleRunLogRow row);
    int update(OrderStatusSyncScheduleRow row);
    int updateEnabled(@Param("userId") Long userId,
                      @Param("id") Long id,
                      @Param("enabledYn") String enabledYn,
                      @Param("nextRunAt") LocalDateTime nextRunAt);
    int delete(@Param("userId") Long userId, @Param("id") Long id);
    int skipStaleDueSchedules(@Param("maxCatchUpMinutes") int maxCatchUpMinutes);
    List<OrderStatusSyncScheduleRow> claimDueSchedules(@Param("limit") int limit);
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
