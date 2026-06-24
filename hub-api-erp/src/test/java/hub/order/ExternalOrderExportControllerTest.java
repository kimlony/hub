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
     * ?紐? API ?醫뤾쿃????곸몵筌?雅뚯눖揆 鈺곌퀬????뺥돩??? ?紐꾪뀱??? ??꾪?401 ?臾먮뼗??獄쏆꼹???롫뮉筌왖 野꺜筌앹빜釉??
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
     * token?? ???筌?orders:read 亦낅슦釉????곸몵筌?雅뚯눖揆 鈺곌퀬????뺥돩??? ?紐꾪뀱??? ??꾪?403 ?臾먮뼗??獄쏆꼹???롫뮉筌왖 野꺜筌앹빜釉??
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
     * orders:read 亦낅슦釉????덈뮉 ?紐? client???類?뇣??雅뚯눖揆 鈺곌퀬????뺥돩??? ?紐꾪뀱??랁?200 ?臾먮뼗??獄쏆룆?쀯쭪? 野꺜筌앹빜釉??
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
