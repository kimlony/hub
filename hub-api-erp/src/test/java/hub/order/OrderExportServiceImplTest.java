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
     * ?紐? 雅뚯눖揆 鈺곌퀬???userId揶쎛 ?袁⑸땾???嚥?userId揶쎛 ??곸몵筌???됱뇚 筌ｌ꼶???롫뮉筌왖 野꺜筌앹빜釉??
     */
    @Test
    void getOrdersForUserRejectsNullUserId() {
        OrderExportServiceImpl service = new OrderExportServiceImpl(jdbcTemplate);

        assertThatThrownBy(() -> service.getOrdersForUser(null, "", "20260618", "20260618", 1, 50))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("userId is required");
    }

    /**
     * page/size ?遺욧퍕揶쏅?????됱읈??甕곕뗄?욄에?癰귣똻???랁?userId?? 疫꿸퀗而?鈺곌퀗援??곗쨮 ?類?뇣??雅뚯눖揆??鈺곌퀬???롫뮉筌왖 野꺜筌앹빜釉??
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
