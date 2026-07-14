package hub.job.mapper;

import hub.job.domain.HubJob;
import hub.job.dto.response.DashboardChannelStat;
import hub.job.dto.response.DashboardRecentJob;
import hub.job.dto.response.DashboardStats;
import hub.job.dto.response.HubJobLogItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HubJobMapper {

    void insertJob(HubJob job);

    HubJob selectByRequestId(String requestId);

    HubJob selectByRequestIdAndCorpId(@Param("requestId") String requestId, @Param("corpId") long corpId);

    HubJob selectByRequestKey(String requestKey);

    List<HubJob> selectPipelineByCorrelationIdAndCorpId(
            @Param("correlationId") String correlationId,
            @Param("corpId") long corpId
    );

    List<HubJob> selectByStatus(String status);

    List<HubJobLogItem> selectJobLogs(String requestId);

    List<HubJob> selectJobListByCorpId(
            @Param("corpId") long corpId,
            @Param("status") String status,
            @Param("channelCd") String channelCd,
            @Param("size") int size,
            @Param("offset") int offset
    );

    int selectJobListCountByCorpId(
            @Param("corpId") long corpId,
            @Param("status") String status,
            @Param("channelCd") String channelCd
    );

    DashboardStats selectDashboardStatsByCorpId(@Param("corpId") long corpId);

    List<DashboardRecentJob> selectDashboardRecentJobsByCorpId(
            @Param("corpId") long corpId, @Param("limit") int limit);

    List<DashboardChannelStat> selectDashboardChannelStatsByCorpId(@Param("corpId") long corpId);

    int updateStatusToReset(
            @Param("requestKey") String requestKey,
            @Param("payload") String payload
    );
    int resetFailedJobForRetryByCorpId(
            @Param("requestKey") String requestKey,
            @Param("payload") String payload,
            @Param("corpId") long corpId
    );

    int resetFailedJobForRetry(
            @Param("requestKey") String requestKey,
            @Param("payload") String payload
    );

    int insertJobIfAbsent(HubJob job);
}
