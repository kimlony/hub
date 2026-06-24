package hub.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.mapper.UserMapper;
import hub.channel.mapper.ChannelMapper;
import hub.job.dto.request.HubJobBatchRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.service.HubJobService;
import hub.schedule.domain.CollectScheduleRow;
import hub.schedule.domain.CollectScheduleRunLogRow;
import hub.schedule.mapper.CollectScheduleMapper;
import hub.schedule.service.CollectScheduleServiceImpl;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CollectScheduleServiceImplTest {

    @Mock
    private CollectScheduleMapper collectScheduleMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ChannelMapper channelMapper;

    @Mock
    private HubJobService hubJobService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * claim????륁춿 ???餓κ쑴????쎈뻬??run log??筌띾슢諭얏?Job ??밴쉐 ?源껊궗 ???源껊궗 ?怨밴묶嚥?疫꿸퀡以??롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void runDueSchedulesExecutesClaimedScheduleAndMarksSuccess() {
        CollectScheduleServiceImpl service = service();
        CollectScheduleRow schedule = schedule();
        HubJobBatchResponse jobResponse = new HubJobBatchResponse(List.of(
                new HubJobBatchResponse.JobResult("request-001", "GODO", "QUEUED"),
                new HubJobBatchResponse.JobResult("request-002", "11ST", "QUEUED")
        ));

        when(collectScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(collectScheduleMapper.claimDueSchedules(20)).thenReturn(List.of(schedule));
        when(hubJobService.createScheduledBatchJobs(eq("admin"), isNull(), any(HubJobBatchRequest.class)))
                .thenReturn(jobResponse);

        service.runDueSchedules();

        ArgumentCaptor<CollectScheduleRunLogRow> runLogCaptor = ArgumentCaptor.forClass(CollectScheduleRunLogRow.class);
        ArgumentCaptor<HubJobBatchRequest> requestCaptor = ArgumentCaptor.forClass(HubJobBatchRequest.class);
        verify(collectScheduleMapper).insertRunLog(runLogCaptor.capture());
        verify(hubJobService).createScheduledBatchJobs(eq("admin"), isNull(), requestCaptor.capture());
        verify(collectScheduleMapper).markRunLogSuccess(isNull(), eq(2), eq("[\"request-001\",\"request-002\"]"));
        verify(collectScheduleMapper).markRunSuccess(eq(10L), any(LocalDateTime.class));

        CollectScheduleRunLogRow runLog = runLogCaptor.getValue();
        assertThat(runLog.getStatus()).isEqualTo("RUNNING");
        assertThat(runLog.getScheduleId()).isEqualTo(10L);
        assertThat(runLog.getUserId()).isEqualTo(1L);
        assertThat(runLog.getMallKeysJson()).isEqualTo("[\"GODO\",\"11ST\"]");
        assertThat(requestCaptor.getValue().mallKeys()).containsExactly("GODO", "11ST");
    }

    /**
     * ???餓???쎈뻬 餓?Job ??밴쉐????쎈솭??롢늺 run log?? schedule????쎈솭 ?怨밴묶嚥?疫꿸퀡以??롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void runDueSchedulesMarksFailedWhenJobCreationFails() {
        CollectScheduleServiceImpl service = service();
        CollectScheduleRow schedule = schedule();

        when(collectScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(collectScheduleMapper.claimDueSchedules(20)).thenReturn(List.of(schedule));
        when(hubJobService.createScheduledBatchJobs(eq("admin"), isNull(), any(HubJobBatchRequest.class)))
                .thenThrow(new RuntimeException("job create failed"));

        service.runDueSchedules();

        verify(collectScheduleMapper).insertRunLog(any(CollectScheduleRunLogRow.class));
        verify(collectScheduleMapper).markRunLogFailed(isNull(), eq("job create failed"));
        verify(collectScheduleMapper).markRunFailed(eq(10L), any(LocalDateTime.class), eq("job create failed"));
        verify(collectScheduleMapper, never()).markRunSuccess(anyLong(), any(LocalDateTime.class));
    }

    /**
     * ??쎈뻬 ???????餓κ쑴????곸몵筌?Job ??밴쉐??援?run log ???關????묐뻬??? ??낅뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void runDueSchedulesDoesNothingWhenNoScheduleIsClaimed() {
        CollectScheduleServiceImpl service = service();

        when(collectScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(collectScheduleMapper.claimDueSchedules(20)).thenReturn(List.of());

        service.runDueSchedules();

        verify(hubJobService, never()).createScheduledBatchJobs(any(), any(), any(HubJobBatchRequest.class));
        verify(collectScheduleMapper, never()).insertRunLog(any(CollectScheduleRunLogRow.class));
    }

    private CollectScheduleServiceImpl service() {
        CollectScheduleServiceImpl service = new CollectScheduleServiceImpl(
                collectScheduleMapper,
                userMapper,
                channelMapper,
                hubJobService,
                objectMapper
        );
        ReflectionTestUtils.setField(service, "collectCatchUpMinutes", 120);
        return service;
    }

    private CollectScheduleRow schedule() {
        CollectScheduleRow row = new CollectScheduleRow();
        row.setId(10L);
        row.setUserId(1L);
        row.setUsername("admin");
        row.setScheduleName("daily collect");
        row.setMallKeysJson("[\"GODO\",\"11ST\"]");
        row.setDateRangeType("TODAY");
        row.setRunTime(LocalTime.of(14, 20));
        return row;
    }
}
