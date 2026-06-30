package hub.order;

import hub.external.ExternalApiPrincipal;
import hub.order.controller.ExternalOrderExportController;
import hub.order.dto.response.OrderExportResponse;
import hub.order.service.OrderExportService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.Mock;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExternalOrderExportControllerTest {

    @Mock
    private OrderExportService orderExportService;

    /**
     * 외부 API 인증 정보가 없으면 주문 조회를 거부하는지 검증한다.
     */
    @Test
    void rejectsRequestWhenExternalTokenIsMissing() {
        ExternalOrderExportController controller = new ExternalOrderExportController(orderExportService);

        ResponseEntity<?> response = controller.exportOrders(null, "20260618", "20260618", 1, 50);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody()).isInstanceOf(Map.class);
        verify(orderExportService, never()).getOrdersForUser(null, "", "20260618", "20260618", 1, 50);
    }

    /**
     * 주문 조회 권한이 없는 외부 인증 주체의 요청을 거부하는지 검증한다.
     */
    @Test
    void rejectsRequestWhenPrincipalHasNoOrdersReadScope() {
        ExternalOrderExportController controller = new ExternalOrderExportController(orderExportService);
        ExternalApiPrincipal principal = new ExternalApiPrincipal(1L, "client-001", List.of("news:read"));

        ResponseEntity<?> response = controller.exportOrders(principal, "20260618", "20260618", 1, 50);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).isInstanceOf(Map.class);
        verify(orderExportService, never()).getOrdersForUser(1L, "", "20260618", "20260618", 1, 50);
    }

    /**
     * 주문 조회 권한이 있으면 주문 데이터를 반환하는지 검증한다.
     */
    @Test
    void returnsOrdersWhenPrincipalHasOrdersReadScope() {
        ExternalOrderExportController controller = new ExternalOrderExportController(orderExportService);
        ExternalApiPrincipal principal = new ExternalApiPrincipal(1L, "client-001", List.of("orders:read"));
        OrderExportResponse exportResponse = new OrderExportResponse(200, List.of(), 0, 1, 50, "20260618163000");

        when(orderExportService.getOrdersForUser(1L, "", "20260618", "20260618", 1, 50))
                .thenReturn(exportResponse);

        ResponseEntity<?> response = controller.exportOrders(principal, "20260618", "20260618", 1, 50);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(exportResponse);
        verify(orderExportService).getOrdersForUser(1L, "", "20260618", "20260618", 1, 50);
    }
}
