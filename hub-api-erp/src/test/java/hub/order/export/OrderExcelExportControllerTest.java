package hub.order.export;

import hub.order.export.controller.OrderExcelExportController;
import hub.order.export.dto.OrderExportFilter;
import hub.order.export.service.OrderExcelExportService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OrderExcelExportControllerTest {
    @Test
    void excelApiReturnsXlsxAttachment() {
        OrderExcelExportService service = mock(OrderExcelExportService.class);
        OrderExportFilter filter = new OrderExportFilter("", "", "", "", "", "", "");
        byte[] content = {1, 2, 3};
        when(service.export("operator", filter)).thenReturn(
                new OrderExcelExportService.ExportedFile("EXCEL-1", "easy-hub-orders-20260701120000.xlsx", content));

        var response = new OrderExcelExportController(service).excel("operator", filter);

        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("attachment", ".xlsx");
        assertThat(response.getHeaders().getFirst("X-Export-Id")).isEqualTo("EXCEL-1");
        assertThat(response.getBody()).isEqualTo(content);
    }
}
