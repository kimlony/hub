package com.bizbee.hub.outbox;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobOutboxMonitorServiceImplTest {

    @Mock
    private JobOutboxMapper jobOutboxMapper;

    /**
     * status 필터를 trim/대문자로 정규화하고 stale 판단 기준 초를 mapper에 전달하는지 검증한다.
     */
    @Test
    void returnsMonitorWithNormalizedStatusAndConfiguredStaleSeconds() {
        JobOutboxMonitorServiceImpl service = service();
        JobOutboxStats stats = stats();
        List<JobOutboxItem> events = List.of(item("FAILED"));

        when(jobOutboxMapper.selectStats(60)).thenReturn(stats);
        when(jobOutboxMapper.selectRecent("FAILED", 20)).thenReturn(events);

        JobOutboxMonitorResponse response = service.getMonitor(" failed ", 20);

        assertThat(response.stats()).isEqualTo(stats);
        assertThat(response.events()).isEqualTo(events);
        assertThat(response.status()).isEqualTo("HEALTHY");
        assertThat(response.generatedAt()).isNotNull();
        verify(jobOutboxMapper).selectStats(60);
        verify(jobOutboxMapper).selectRecent("FAILED", 20);
    }

    /**
     * status가 공백이면 전체 조회가 되도록 null status로 변환하는지 검증한다.
     */
    @Test
    void usesNullStatusWhenStatusIsBlank() {
        JobOutboxMonitorServiceImpl service = service();
        JobOutboxStats stats = stats();

        when(jobOutboxMapper.selectStats(60)).thenReturn(stats);
        when(jobOutboxMapper.selectRecent(null, 50)).thenReturn(List.of());

        JobOutboxMonitorResponse response = service.getMonitor("   ", 50);

        assertThat(response.stats()).isEqualTo(stats);
        assertThat(response.events()).isEmpty();
        verify(jobOutboxMapper).selectRecent(null, 50);
    }

    /**
     * 요청 limit이 1보다 작으면 최소값 1로 보정하는지 검증한다.
     */
    @Test
    void clampsLimitToOneWhenRequestedLimitIsTooSmall() {
        JobOutboxMonitorServiceImpl service = service();
        JobOutboxStats stats = stats();

        when(jobOutboxMapper.selectStats(60)).thenReturn(stats);
        when(jobOutboxMapper.selectRecent(null, 1)).thenReturn(List.of());

        service.getMonitor(null, 0);

        verify(jobOutboxMapper).selectRecent(null, 1);
    }

    /**
     * 요청 limit이 100보다 크면 최대값 100로 보정하는지 검증한다.
     */
    @Test
    void clampsLimitToOneHundredWhenRequestedLimitIsTooLarge() {
        JobOutboxMonitorServiceImpl service = service();
        JobOutboxStats stats = stats();

        when(jobOutboxMapper.selectStats(60)).thenReturn(stats);
        when(jobOutboxMapper.selectRecent("PENDING", 100)).thenReturn(List.of());

        service.getMonitor("PENDING", 1000);

        verify(jobOutboxMapper).selectRecent("PENDING", 100);
    }

    private JobOutboxMonitorServiceImpl service() {
        JobOutboxMonitorServiceImpl service = new JobOutboxMonitorServiceImpl(jobOutboxMapper);
        ReflectionTestUtils.setField(service, "publishingStaleSeconds", 60);
        return service;
    }

    private JobOutboxStats stats() {
        return new JobOutboxStats(10L, 2L, 1L, 6L, 1L, 1L);
    }

    private JobOutboxItem item(String status) {
        return new JobOutboxItem(
                1L,
                "request-001",
                "ORDER_COLLECT",
                "hub.jobs",
                "ORDER_COLLECT:1:GODO",
                status,
                1,
                5,
                "kafka down",
                "2026-06-18 10:00:00",
                "2026-06-18 10:01:00",
                "2026-06-18 10:02:00",
                null,
                null
        );
    }
}
