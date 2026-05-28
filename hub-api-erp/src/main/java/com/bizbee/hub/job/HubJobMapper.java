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

    void updateStatus(
            @Param("requestId") String requestId,
            @Param("status") String status,
            @Param("errorMessage") String errorMessage
    );

    void updateStatusToReset(String requestKey);
}
