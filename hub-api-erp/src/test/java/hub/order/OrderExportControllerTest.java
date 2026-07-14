package hub.order;

import hub.auth.domain.HubUser;
import hub.auth.HubUserPrincipal;
import hub.auth.mapper.UserMapper;
import hub.order.controller.OrderExportController;
import hub.order.dto.response.OrderExportResponse;
import hub.order.service.OrderExportService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderExportControllerTest {

    /**
     * 로그인 사용자의 회사 범위로 수집 주문을 조회하는지 검증한다.
     */
    @Test
    void exportOrdersUsesAuthenticatedUserScopeAndGridFilters() {
        OrderExportService orderExportService = mock(OrderExportService.class);
        UserMapper userMapper = mock(UserMapper.class);
        HubUser user = new HubUser();
        user.setId(7L);
        user.setUsername("operator");
        when(userMapper.findByUsername("operator")).thenReturn(Optional.of(user));

        OrderExportResponse expected = new OrderExportResponse(200, List.of(), 0, 1, 50, "20260630120000");
        when(orderExportService.getOrdersForUser(
                7L,
                "ONRY",
                "PAID",
                "ORDER-1",
                "20260601",
                "20260630",
                1,
                50
        )).thenReturn(expected);

        OrderExportController controller = new OrderExportController(orderExportService, userMapper);
        OrderExportResponse response = controller.exportOrders(
                new HubUserPrincipal(7L, 100L, "operator", "USER"),
                "ONRY",
                "PAID",
                "ORDER-1",
                "20260601",
                "20260630",
                1,
                50
        ).getBody();

        assertThat(response).isSameAs(expected);
        verify(orderExportService).getOrdersForUser(
                7L,
                "ONRY",
                "PAID",
                "ORDER-1",
                "20260601",
                "20260630",
                1,
                50
        );
    }
}
