package com.bizbee.hub.schedule;

import com.bizbee.hub.auth.UserMapper;
import com.bizbee.hub.channel.ChannelMapper;
import com.bizbee.hub.job.HubJobBatchRequest;
import com.bizbee.hub.job.HubJobBatchResponse;
import com.bizbee.hub.job.HubJobService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

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
     * claim된 수집 스케줄을 실행해 run log를 만들고 Job 생성 성공 시 성공 상태로 기록하는지 검증한다.
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
     * 스케줄 실행 중 Job 생성이 실패하면 run log와 schedule을 실패 상태로 기록하는지 검증한다.
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
     * 실행 대상 스케줄이 없으면 Job 생성이나 run log 저장을 수행하지 않는지 검증한다.
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
