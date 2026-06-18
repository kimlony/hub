package com.bizbee.hub.order;

import com.bizbee.hub.external.ExternalApiPrincipal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExternalOrderExportControllerTest {

    @Mock
    private OrderExportService orderExportService;

    /**
     * 외부 API 토큰이 없으면 주문 조회 서비스를 호출하지 않고 401 응답을 반환하는지 검증한다.
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
     * token은 있지만 orders:read 권한이 없으면 주문 조회 서비스를 호출하지 않고 403 응답을 반환하는지 검증한다.
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
     * orders:read 권한이 있는 외부 client는 정규화 주문 조회 서비스를 호출하고 200 응답을 받는지 검증한다.
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
