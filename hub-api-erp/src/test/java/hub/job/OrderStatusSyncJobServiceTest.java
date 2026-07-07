package hub.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.channel.domain.ChannelRow;
import hub.channel.mapper.ChannelMapper;
import hub.job.domain.HubJob;
import hub.job.domain.HubJobStatus;
import hub.job.dto.request.OrderStatusSyncRequest;
import hub.job.event.HubJobEvent;
import hub.job.mapper.HubJobMapper;
import hub.job.service.HubJobServiceImpl;
import hub.job.service.JobPayloadValidator;
import hub.outbox.service.JobOutboxService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderStatusSyncJobServiceTest {

    @Test
    void createsStatusSyncJobWithResourcePayloadAndOutbox() {
        HubJobMapper jobMapper = mock(HubJobMapper.class);
        JobOutboxService outboxService = mock(JobOutboxService.class);
        UserMapper userMapper = mock(UserMapper.class);
        ChannelMapper channelMapper = mock(ChannelMapper.class);
        ObjectMapper objectMapper = new ObjectMapper();
        HubJobServiceImpl service = new HubJobServiceImpl(
                jobMapper, outboxService, objectMapper, userMapper, channelMapper,
                mock(JdbcTemplate.class), new JobPayloadValidator(objectMapper));
        HubUser user = new HubUser();
        user.setId(7L);
        user.setCorpId(100L);
        user.setUsername("admin");
        ChannelRow account = ChannelRow.builder()
                .id(23L).corpId(100L).userId(7L).mallKey("MOCK_MALL").useYn("Y").build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndId(100L, 23L)).thenReturn(Optional.of(account));
        when(jobMapper.selectByRequestKey(any())).thenReturn(null);
        when(jobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(1);

        service.createStatusSyncJobs("admin", new OrderStatusSyncRequest(
                "20260701", "20260706", null, List.of(23L), List.of("결제완료", "배송중")));

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        ArgumentCaptor<HubJobEvent> eventCaptor = ArgumentCaptor.forClass(HubJobEvent.class);
        verify(jobMapper).insertJobIfAbsent(jobCaptor.capture());
        verify(outboxService).enqueue(eventCaptor.capture());

        HubJob job = jobCaptor.getValue();
        assertThat(job.getJobType()).isEqualTo("ORDER_STATUS_SYNC");
        assertThat(job.getRequestKey()).startsWith("STATUS_SYNC_23*MOCK_MALL*20260701*20260706*");
        assertThat(job.getStatus()).isEqualTo(HubJobStatus.QUEUED);
        assertThat(eventCaptor.getValue().payload())
                .containsEntry("userId", 7)
                .containsEntry("corpId", 100)
                .containsEntry("channelAccountId", 23)
                .containsEntry("syncMode", "RANGE")
                .containsEntry("erpApplyEnabled", false);
        assertThat(eventCaptor.getValue().payload().get("statusTypes"))
                .isEqualTo(List.of("결제완료", "배송중"));
    }
    @Test
    void createsStatusSyncJobForSupportedRealMall() {
        HubJobMapper jobMapper = mock(HubJobMapper.class);
        JobOutboxService outboxService = mock(JobOutboxService.class);
        UserMapper userMapper = mock(UserMapper.class);
        ChannelMapper channelMapper = mock(ChannelMapper.class);
        ObjectMapper objectMapper = new ObjectMapper();
        HubJobServiceImpl service = new HubJobServiceImpl(
                jobMapper, outboxService, objectMapper, userMapper, channelMapper,
                mock(JdbcTemplate.class), new JobPayloadValidator(objectMapper));
        HubUser user = new HubUser();
        user.setId(7L);
        user.setCorpId(100L);
        user.setUsername("admin");
        ChannelRow account = ChannelRow.builder()
                .id(24L).corpId(100L).userId(7L).mallKey("COUPANG").useYn("Y").build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndId(100L, 24L)).thenReturn(Optional.of(account));
        when(jobMapper.selectByRequestKey(any())).thenReturn(null);
        when(jobMapper.insertJobIfAbsent(any(HubJob.class))).thenReturn(1);

        service.createStatusSyncJobs("admin", new OrderStatusSyncRequest(
                "20260701", "20260706", null, List.of(24L), List.of("DELIVERING")));

        ArgumentCaptor<HubJob> jobCaptor = ArgumentCaptor.forClass(HubJob.class);
        verify(jobMapper).insertJobIfAbsent(jobCaptor.capture());
        assertThat(jobCaptor.getValue().getRequestKey())
                .startsWith("STATUS_SYNC_24*COUPANG*20260701*20260706*");
        assertThat(jobCaptor.getValue().getChannelCd()).isEqualTo("COUPANG");
        verify(outboxService).enqueue(any(HubJobEvent.class));
    }

    @Test
    void rejectsStatusSyncJobForUnsupportedMall() {
        HubJobMapper jobMapper = mock(HubJobMapper.class);
        JobOutboxService outboxService = mock(JobOutboxService.class);
        UserMapper userMapper = mock(UserMapper.class);
        ChannelMapper channelMapper = mock(ChannelMapper.class);
        ObjectMapper objectMapper = new ObjectMapper();
        HubJobServiceImpl service = new HubJobServiceImpl(
                jobMapper, outboxService, objectMapper, userMapper, channelMapper,
                mock(JdbcTemplate.class), new JobPayloadValidator(objectMapper));
        HubUser user = new HubUser();
        user.setId(7L);
        user.setCorpId(100L);
        user.setUsername("admin");
        ChannelRow account = ChannelRow.builder()
                .id(25L).corpId(100L).userId(7L).mallKey("NSS").useYn("Y").build();

        when(userMapper.findByUsername("admin")).thenReturn(Optional.of(user));
        when(channelMapper.findActiveByCorpIdAndId(100L, 25L)).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.createStatusSyncJobs("admin", new OrderStatusSyncRequest(
                "20260701", "20260706", null, List.of(25L), List.of("DELIVERING"))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("ORDER_STATUS_SYNC is not supported for mall: NSS");
    }
}