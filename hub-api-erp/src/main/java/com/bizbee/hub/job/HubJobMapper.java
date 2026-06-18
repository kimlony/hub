package com.bizbee.hub.job;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HubJobMapper {

    void insertJob(HubJob job);

    HubJob selectByRequestId(String requestId);

    HubJob selectByRequestKey(String requestKey);

    List<HubJob> selectByStatus(String status);

    List<HubJobLogItem> selectJobLogs(String requestId);

    List<HubJob> selectJobList(
            @Param("status") String status,
            @Param("channelCd") String channelCd,
            @Param("size") int size,
            @Param("offset") int offset
    );

    int selectJobListCount(
            @Param("status") String status,
            @Param("channelCd") String channelCd
    );

    DashboardStats selectDashboardStats();

    List<DashboardRecentJob> selectDashboardRecentJobs(@Param("limit") int limit);

    List<DashboardChannelStat> selectDashboardChannelStats();

    int updateStatusToReset(
            @Param("requestKey") String requestKey,
            @Param("payload") String payload
    );
    int resetFailedJobForRetry(
            @Param("requestKey") String requestKey,
            @Param("payload") String payload
    );

    int insertJobIfAbsent(HubJob job);
}
