package com.bizbee.hub.schedule;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CollectScheduleMapper {
    List<CollectScheduleRow> findByUserId(@Param("userId") Long userId);
    CollectScheduleRow findByUserIdAndId(@Param("userId") Long userId, @Param("id") Long id);
    void insert(CollectScheduleRow row);
    int update(CollectScheduleRow row);
    int updateEnabled(@Param("userId") Long userId,
                      @Param("id") Long id,
                      @Param("enabledYn") String enabledYn,
                      @Param("nextRunAt") LocalDateTime nextRunAt);
    int delete(@Param("userId") Long userId, @Param("id") Long id);
    List<CollectScheduleRow> claimDueSchedules(@Param("limit") int limit);
    void markRunSuccess(@Param("id") Long id,
                        @Param("nextRunAt") LocalDateTime nextRunAt);
    void markRunFailed(@Param("id") Long id,
                       @Param("nextRunAt") LocalDateTime nextRunAt,
                       @Param("errorMessage") String errorMessage);
}
