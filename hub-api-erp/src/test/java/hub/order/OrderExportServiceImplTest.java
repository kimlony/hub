package hub.order;

import hub.order.dto.response.OrderExportResponse;
import hub.order.service.OrderExportServiceImpl;
import java.util.List;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
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
     * 사용자 ID가 없으면 주문 조회를 거부하는지 검증한다.
     */
    @Test
    void getOrdersForUserRejectsNullUserId() {
        OrderExportServiceImpl service = new OrderExportServiceImpl(jdbcTemplate);

        assertThatThrownBy(() -> service.getOrdersForUser(null, "", "20260618", "20260618", 1, 50))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("userId is required");
    }

    /**
     * 페이지 값을 보정하고 정규화된 주문 응답을 반환하는지 검증한다.
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
