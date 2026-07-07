package hub.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.domain.ChannelRow;
import hub.channel.mapper.ChannelMapper;
import hub.job.dto.request.OrderStatusSyncRequest;
import hub.job.dto.response.HubJobBatchResponse;
import hub.job.service.HubJobService;
import hub.schedule.domain.OrderStatusSyncScheduleRow;
import hub.schedule.domain.OrderStatusSyncScheduleRunLogRow;
import hub.schedule.dto.request.OrderStatusSyncScheduleRequest;
import hub.schedule.mapper.OrderStatusSyncScheduleMapper;
import hub.schedule.service.OrderStatusSyncScheduleServiceImpl;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderStatusSyncScheduleServiceImplTest {

    @Mock
    private OrderStatusSyncScheduleMapper orderStatusSyncScheduleMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private ChannelMapper channelMapper;

    @Mock
    private HubJobService hubJobService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void runDueSchedulesCreatesOrderStatusSyncJobsAndMarksSuccess() {
        OrderStatusSyncScheduleServiceImpl service = service();
        OrderStatusSyncScheduleRow schedule = schedule();
        HubJobBatchResponse jobResponse = new HubJobBatchResponse(List.of(
                new HubJobBatchResponse.JobResult("status-request-001", "MOCK_MALL", "QUEUED")
        ));

        when(orderStatusSyncScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(orderStatusSyncScheduleMapper.claimDueSchedules(20)).thenReturn(List.of(schedule));
        when(hubJobService.createStatusSyncJobs(eq("admin"), any(OrderStatusSyncRequest.class)))
                .thenReturn(jobResponse);

        service.runDueSchedules();

        ArgumentCaptor<OrderStatusSyncScheduleRunLogRow> runLogCaptor =
                ArgumentCaptor.forClass(OrderStatusSyncScheduleRunLogRow.class);
        ArgumentCaptor<OrderStatusSyncRequest> requestCaptor = ArgumentCaptor.forClass(OrderStatusSyncRequest.class);
        verify(orderStatusSyncScheduleMapper).insertRunLog(runLogCaptor.capture());
        verify(hubJobService).createStatusSyncJobs(eq("admin"), requestCaptor.capture());
        verify(orderStatusSyncScheduleMapper)
                .markRunLogSuccess(null, 1, "[\"status-request-001\"]");
        verify(orderStatusSyncScheduleMapper).markRunSuccess(eq(10L), any(LocalDateTime.class));

        OrderStatusSyncScheduleRunLogRow runLog = runLogCaptor.getValue();
        assertThat(runLog.getStatus()).isEqualTo("RUNNING");
        assertThat(runLog.getScheduleId()).isEqualTo(10L);
        assertThat(runLog.getMallKeysJson()).isEqualTo("[\"MOCK_MALL\"]");
        assertThat(runLog.getStatusTypesJson()).isEqualTo("[\"PAID\",\"SHIPPING\"]");

        OrderStatusSyncRequest request = requestCaptor.getValue();
        assertThat(request.mallKeys()).containsExactly("MOCK_MALL");
        assertThat(request.channelAccountIds()).isNull();
        assertThat(request.statusTypes()).containsExactly("PAID", "SHIPPING");
        assertThat(request.frDt()).hasSize(8);
        assertThat(request.toDt()).hasSize(8);
    }

    @Test
    void runDueSchedulesMarksFailedWhenJobCreationFails() {
        OrderStatusSyncScheduleServiceImpl service = service();
        OrderStatusSyncScheduleRow schedule = schedule();

        when(orderStatusSyncScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(orderStatusSyncScheduleMapper.claimDueSchedules(20)).thenReturn(List.of(schedule));
        when(hubJobService.createStatusSyncJobs(eq("admin"), any(OrderStatusSyncRequest.class)))
                .thenThrow(new RuntimeException("status sync job create failed"));

        service.runDueSchedules();

        verify(orderStatusSyncScheduleMapper).insertRunLog(any(OrderStatusSyncScheduleRunLogRow.class));
        verify(orderStatusSyncScheduleMapper).markRunLogFailed(null, "status sync job create failed");
        verify(orderStatusSyncScheduleMapper)
                .markRunFailed(eq(10L), any(LocalDateTime.class), eq("status sync job create failed"));
        verify(orderStatusSyncScheduleMapper, never()).markRunSuccess(anyLong(), any(LocalDateTime.class));
    }

    @Test
    void runDueSchedulesDoesNothingWhenNoScheduleIsClaimed() {
        OrderStatusSyncScheduleServiceImpl service = service();

        when(orderStatusSyncScheduleMapper.skipStaleDueSchedules(120)).thenReturn(0);
        when(orderStatusSyncScheduleMapper.claimDueSchedules(20)).thenReturn(List.of());

        service.runDueSchedules();

        verify(hubJobService, never()).createStatusSyncJobs(any(), any(OrderStatusSyncRequest.class));
        verify(orderStatusSyncScheduleMapper, never()).insertRunLog(any(OrderStatusSyncScheduleRunLogRow.class));
    }

    @Test
    void createScheduleAcceptsMockMallWithoutExistingChannelAccount() {
        OrderStatusSyncScheduleServiceImpl service = service();
        HubUser user = user();
        OrderStatusSyncScheduleRequest request = new OrderStatusSyncScheduleRequest(
                "mock status sync",
                List.of("MOCK_MALL"),
                null,
                List.of("PAID"),
                "FIXED_TIME",
                null,
                "TODAY",
                "14:20",
                "Y"
        );
        OrderStatusSyncScheduleRow inserted = schedule();
        inserted.setId(99L);

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(orderStatusSyncScheduleMapper.findByUserIdAndId(eq(1L), any()))
                .thenReturn(inserted);

        service.createSchedule("admin", request);

        ArgumentCaptor<OrderStatusSyncScheduleRow> rowCaptor =
                ArgumentCaptor.forClass(OrderStatusSyncScheduleRow.class);
        verify(orderStatusSyncScheduleMapper).insert(rowCaptor.capture());
        assertThat(rowCaptor.getValue().getMallKeysJson()).isEqualTo("[\"MOCK_MALL\"]");
        assertThat(rowCaptor.getValue().getStatusTypesJson()).isEqualTo("[\"PAID\"]");
    }

    @Test
    void createScheduleRequiresMallKeysOrChannelAccountIds() {
        OrderStatusSyncScheduleServiceImpl service = service();
        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user()));

        OrderStatusSyncScheduleRequest request = new OrderStatusSyncScheduleRequest(
                "empty target",
                List.of(),
                List.of(),
                List.of("PAID"),
                "FIXED_TIME",
                null,
                "TODAY",
                "14:20",
                "Y"
        );

        assertThatThrownBy(() -> service.createSchedule("admin", request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("mallKeys or channelAccountIds must not be empty");
    }

    @Test
    void createScheduleValidatesChannelAccountId() {
        OrderStatusSyncScheduleServiceImpl service = service();
        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user()));
        when(channelMapper.findActiveByCorpIdAndId(100L, 77L))
                .thenReturn(Optional.of(ChannelRow.builder().id(77L).mallKey("GODO").build()));
        OrderStatusSyncScheduleRequest request = new OrderStatusSyncScheduleRequest(
                "account status sync",
                null,
                List.of(77L),
                List.of("SHIPPING"),
                "FIXED_TIME",
                null,
                "TODAY",
                "14:20",
                "Y"
        );
        OrderStatusSyncScheduleRow inserted = schedule();
        inserted.setMallKeysJson("[]");
        inserted.setChannelAccountIdsJson("[77]");
        inserted.setStatusTypesJson("[\"SHIPPING\"]");
        when(orderStatusSyncScheduleMapper.findByUserIdAndId(eq(1L), any()))
                .thenReturn(inserted);

        service.createSchedule("admin", request);

        ArgumentCaptor<OrderStatusSyncScheduleRow> rowCaptor =
                ArgumentCaptor.forClass(OrderStatusSyncScheduleRow.class);
        verify(orderStatusSyncScheduleMapper).insert(rowCaptor.capture());
        assertThat(rowCaptor.getValue().getChannelAccountIdsJson()).isEqualTo("[77]");
    }

    private OrderStatusSyncScheduleServiceImpl service() {
        OrderStatusSyncScheduleServiceImpl service = new OrderStatusSyncScheduleServiceImpl(
                orderStatusSyncScheduleMapper,
                userMapper,
                channelMapper,
                hubJobService,
                objectMapper
        );
        ReflectionTestUtils.setField(service, "statusSyncCatchUpMinutes", 120);
        return service;
    }

    private OrderStatusSyncScheduleRow schedule() {
        OrderStatusSyncScheduleRow row = new OrderStatusSyncScheduleRow();
        row.setId(10L);
        row.setUserId(1L);
        row.setUsername("admin");
        row.setScheduleName("mock status sync");
        row.setMallKeysJson("[\"MOCK_MALL\"]");
        row.setChannelAccountIdsJson("[]");
        row.setStatusTypesJson("[\"PAID\",\"SHIPPING\"]");
        row.setDateRangeType("TODAY");
        row.setRunTime(LocalTime.of(14, 20));
        return row;
    }

    private HubUser user() {
        HubUser user = new HubUser();
        user.setId(1L);
        user.setCorpId(100L);
        user.setUsername("admin");
        return user;
    }
}
