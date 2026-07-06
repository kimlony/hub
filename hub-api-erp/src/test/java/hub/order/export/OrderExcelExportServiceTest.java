package hub.order.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.order.export.dto.OrderExcelItem;
import hub.order.export.dto.OrderExportFilter;
import hub.order.export.service.OrderExcelExportService;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderExcelExportServiceTest {
    @Mock JdbcTemplate jdbcTemplate;
    @Mock UserMapper userMapper;

    @Test
    void previewLimitsItemsToFifty() {
        OrderExcelExportService service = service();
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(75L);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(Collections.nCopies(50, item()));

        var response = service.preview("operator", filter());

        assertThat(response.totalCount()).isEqualTo(75);
        assertThat(response.previewCount()).isEqualTo(50);
        assertThat(response.items()).hasSize(50);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> params = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), params.capture());
        assertThat(sql.getValue()).contains("LIMIT ?");
        assertThat(params.getValue()).endsWith(50);
    }

    @Test
    void exportCreatesXlsxAndStoresFileAndPrivacySafeOrderLogs() throws Exception {
        OrderExcelExportService service = service();
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(item()));

        var exported = service.export("operator", filter());

        assertThat(exported.fileName()).matches("easy-hub-orders-\\d{14}\\.xlsx");
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(exported.content()))) {
            assertThat(workbook.getSheet("주문")).isNotNull();
            assertThat(workbook.getSheet("주문").getRow(0).getCell(0).getStringCellValue()).isEqualTo("쇼핑몰");
            assertThat(workbook.getSheet("주문").getRow(1).getCell(2).getStringCellValue()).isEqualTo("ORDER-1");
            assertThat(workbook.getSheet("주문").getPaneInformation().isFreezePane()).isTrue();
            assertThat(workbook.getSheet("주문").getRow(0).getCell(0).getCellStyle().getFontIndex())
                    .isNotEqualTo(workbook.getSheet("주문").getRow(1).getCell(0).getCellStyle().getFontIndex());
            assertThat(workbook.getSheet("주문").getRow(1).getCell(4).getCellStyle().getDataFormatString())
                    .isEqualTo("yyyy-mm-dd hh:mm:ss");
            assertThat(workbook.getSheet("주문").getRow(1).getCell(16).getCellStyle().getDataFormatString())
                    .isEqualTo("#,##0");
        }

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> values = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, org.mockito.Mockito.times(2)).update(sql.capture(), values.capture());
        assertThat(sql.getAllValues().get(0)).contains("hub_order_export_file");
        assertThat(sql.getAllValues().get(1)).contains(
                "hub_erp_apply_result", "EXCEL_EXPORT", "MANUAL", "ON CONFLICT");
        Object[] deliveryValues = values.getAllValues().get(1);
        assertThat(deliveryValues[3].toString()).startsWith("EXCEL_EXPORT:");
        assertThat(deliveryValues[5].toString())
                .contains("orderNo", "channelCd", "orderStatus", "orderAmount", "itemCount")
                .doesNotContain("buyerName", "receiverName", "receiverTel", "address");
        verify(jdbcTemplate, never()).update(
                org.mockito.ArgumentMatchers.startsWith("UPDATE hub_collected_order"), any(Object[].class));
    }

    private OrderExcelExportService service() {
        HubUser user = new HubUser(); user.setId(7L); user.setCorpId(100L);
        when(userMapper.findByUsername("operator")).thenReturn(Optional.of(user));
        return new OrderExcelExportService(jdbcTemplate, userMapper, new ObjectMapper());
    }

    private OrderExportFilter filter() {
        return new OrderExportFilter("20260701", "20260702", "GODO", "GODO", "PAID", "", "READY");
    }

    private OrderExcelItem item() {
        OffsetDateTime now = OffsetDateTime.parse("2026-07-01T12:00:00+09:00");
        return new OrderExcelItem(501L, "GODO", "Account", "ORDER-1", "ITEM-1", now, now,
                "Sensitive Buyer", "Sensitive Receiver", "010-0000-0000", "12345",
                "Sensitive Address", "Detail", "SKU-1", "Product", "Option", 2,
                new BigDecimal("1000"), new BigDecimal("2000"), new BigDecimal("3000"),
                "PAID", "", "READY", "Carrier", "TRACK", now, "GODO", 1);
    }
}
