package com.bizbee.hub.order;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderExportServiceImplTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    /**
     * 외부 주문 조회는 userId가 필수이므로 userId가 없으면 예외 처리하는지 검증한다.
     */
    @Test
    void getOrdersForUserRejectsNullUserId() {
        OrderExportServiceImpl service = new OrderExportServiceImpl(jdbcTemplate);

        assertThatThrownBy(() -> service.getOrdersForUser(null, "", "20260618", "20260618", 1, 50))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("userId is required");
    }

    /**
     * page/size 요청값을 안전한 범위로 보정하고 userId와 기간 조건으로 정규화 주문을 조회하는지 검증한다.
     */
    @Test
    void getOrdersForUserClampsPageAndSizeAndReturnsNormalizedResponse() {
        OrderExportServiceImpl service = new OrderExportServiceImpl(jdbcTemplate);

        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        OrderExportResponse response = service.getOrdersForUser(1L, "", "20260618", "20260618", 0, 1000);

        assertThat(response.responseCode()).isEqualTo(200);
        assertThat(response.orders()).isEmpty();
        assertThat(response.total()).isZero();
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(200);
        assertThat(response.generatedAt()).matches("\\d{14}");

        ArgumentCaptor<Object[]> countParamsCaptor = ArgumentCaptor.forClass(Object[].class);
        ArgumentCaptor<Object[]> selectParamsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).queryForObject(anyString(), eq(Long.class), countParamsCaptor.capture());
        verify(jdbcTemplate).query(anyString(), any(RowMapper.class), selectParamsCaptor.capture());

        assertThat(countParamsCaptor.getValue()).containsExactly(1L, "20260618", "20260618");
        assertThat(selectParamsCaptor.getValue()).containsExactly(1L, "20260618", "20260618", 200, 0);
    }
}
