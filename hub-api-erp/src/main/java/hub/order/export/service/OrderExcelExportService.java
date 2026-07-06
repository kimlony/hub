package hub.order.export.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import hub.auth.AuthException;
import hub.auth.domain.HubUser;
import hub.auth.mapper.UserMapper;
import hub.order.export.dto.OrderExcelItem;
import hub.order.export.dto.OrderExportFilter;
import hub.order.export.dto.OrderExportHistoryItem;
import hub.order.export.dto.OrderExportPreviewResponse;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderExcelExportService {
    private static final int PREVIEW_LIMIT = 50;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter FILE_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final String[] HEADERS = {
            "쇼핑몰", "쇼핑몰계정", "주문번호", "상품주문번호", "주문일시", "결제일시",
            "구매자명", "수령자명", "수령자전화번호", "우편번호", "주소", "상세주소",
            "상품코드", "상품명", "옵션명", "수량", "판매가", "결제금액", "배송비",
            "주문상태", "클레임상태", "배송상태", "택배사", "송장번호", "수집일시"
    };

    private final JdbcTemplate jdbcTemplate;
    private final UserMapper userMapper;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public OrderExportPreviewResponse preview(String username, OrderExportFilter filter) {
        HubUser user = user(username);
        Query query = query(user.getCorpId(), filter);
        Long total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM (" + query.sql() + ") export_rows",
                Long.class, query.params().toArray());
        List<Object> previewParams = new ArrayList<>(query.params());
        previewParams.add(PREVIEW_LIMIT);
        List<OrderExcelItem> items = jdbcTemplate.query(query.sql() + " LIMIT ?", this::mapItem,
                previewParams.toArray());
        return new OrderExportPreviewResponse(total == null ? 0 : total, items.size(), items);
    }

    @Transactional
    public ExportedFile export(String username, OrderExportFilter filter) {
        HubUser user = user(username);
        Query query = query(user.getCorpId(), filter);
        List<OrderExcelItem> items = jdbcTemplate.query(query.sql(), this::mapItem, query.params().toArray());
        String exportId = "EXCEL-" + UUID.randomUUID();
        String fileName = "easy-hub-orders-" + OffsetDateTime.now(KST).format(FILE_TIME) + ".xlsx";
        byte[] content = workbook(items);
        String filterJson = json(filter);

        jdbcTemplate.update("""
                INSERT INTO hub_order_export_file (
                    export_id, corp_id, user_id, export_type, status, file_name,
                    total_count, filter_payload, created_at, completed_at
                ) VALUES (?, ?, ?, 'ORDER_EXCEL', 'SUCCESS', ?, ?, CAST(? AS jsonb), NOW(), NOW())
                """, exportId, user.getCorpId(), user.getId(), fileName, items.size(), filterJson);

        Map<Long, OrderExcelItem> orders = new LinkedHashMap<>();
        items.forEach(item -> orders.putIfAbsent(item.normalizedOrderId(), item));
        for (OrderExcelItem item : orders.values()) {
            String response = json(Map.of(
                    "orderNo", text(item.orderNo()),
                    "channelCd", text(item.channelCd()),
                    "orderStatus", text(item.orderStatus()),
                    "orderAmount", item.orderAmount() == null ? BigDecimal.ZERO : item.orderAmount(),
                    "itemCount", item.itemCount()));
            jdbcTemplate.update("""
                    INSERT INTO hub_erp_apply_result (
                        request_id, correlation_id, normalized_order_id, erp_connection_id,
                        operation, status, idempotency_key, request_payload, response_payload,
                        attempt_count, applied_at, delivery_type, trigger_type, created_at, updated_at
                    ) VALUES (?, ?, ?, 'EXCEL_EXPORT', 'ORDER_EXPORT', 'SUCCESS', ?,
                              CAST(? AS jsonb), CAST(? AS jsonb), 1, NOW(),
                              'EXCEL_EXPORT', 'MANUAL', NOW(), NOW())
                    ON CONFLICT (idempotency_key, normalized_order_id) DO NOTHING
                    """, exportId, exportId, item.normalizedOrderId(),
                    "EXCEL_EXPORT:" + exportId + ":" + item.normalizedOrderId(), filterJson, response);
        }
        return new ExportedFile(exportId, fileName, content);
    }

    @Transactional(readOnly = true)
    public List<OrderExportHistoryItem> history(String username) {
        HubUser user = user(username);
        return jdbcTemplate.query("""
                SELECT export_id, status, file_name, total_count, created_at, completed_at, error_message
                FROM hub_order_export_file
                WHERE corp_id = ?
                ORDER BY created_at DESC
                LIMIT 20
                """, (rs, rowNum) -> new OrderExportHistoryItem(
                rs.getString("export_id"), rs.getString("status"), rs.getString("file_name"),
                rs.getInt("total_count"), offset(rs, "created_at"), offset(rs, "completed_at"),
                rs.getString("error_message")), user.getCorpId());
    }

    private HubUser user(String username) {
        return userMapper.findByUsername(username).orElseThrow(() -> new AuthException("user not found"));
    }

    private Query query(long corpId, OrderExportFilter filter) {
        List<Object> params = new ArrayList<>();
        params.add(corpId);
        StringBuilder sql = new StringBuilder("""
                SELECT o.id AS normalized_order_id,
                       COALESCE(o.mall_key, o.channel_cd) AS mall_name,
                       COALESCE(m.account_name, '') AS mall_account,
                       o.channel_order_id AS order_no,
                       COALESCE(i.channel_order_item_id, '') AS order_item_no,
                       o.order_date, o.paid_at, COALESCE(o.buyer_name, '') AS buyer_name,
                       COALESCE(d.receiver_name, '') AS receiver_name,
                       COALESCE(d.receiver_tel, '') AS receiver_tel,
                       COALESCE(d.receiver_zip_code, '') AS zip_code,
                       COALESCE(d.receiver_addr1, '') AS address,
                       COALESCE(d.receiver_addr2, '') AS address_detail,
                       COALESCE(i.seller_product_code, i.product_id, i.sku_code, '') AS product_code,
                       COALESCE(i.product_name, '') AS product_name,
                       COALESCE(i.option_name, '') AS option_name,
                       i.quantity, i.unit_price, o.order_amount, o.delivery_fee,
                       COALESCE(o.order_status, '') AS order_status,
                       COALESCE(o.claim_status, '') AS claim_status,
                       COALESCE(d.delivery_status, '') AS delivery_status,
                       COALESCE(d.delivery_company, '') AS delivery_company,
                       COALESCE(d.tracking_number, '') AS tracking_number,
                       o.collected_at, o.channel_cd,
                       COUNT(i.id) OVER (PARTITION BY o.id)::int AS item_count
                FROM hub_collected_order o
                JOIN user_malls m ON m.id = o.channel_account_id
                LEFT JOIN hub_collected_order_item i ON i.order_id = o.id
                LEFT JOIN hub_collected_order_delivery d ON d.order_id = o.id
                WHERE o.corp_id = ?
                """);
        add(sql, params, "o.channel_cd", filter.channelCd());
        add(sql, params, "o.mall_key", filter.mallKey());
        add(sql, params, "o.order_status", filter.orderStatus());
        add(sql, params, "o.claim_status", filter.claimStatus());
        add(sql, params, "d.delivery_status", filter.deliveryStatus());
        if (!blank(filter.frDt())) {
            sql.append(" AND o.order_date >= to_date(?, 'YYYYMMDD')");
            params.add(filter.frDt().trim());
        }
        if (!blank(filter.toDt())) {
            sql.append(" AND o.order_date < to_date(?, 'YYYYMMDD') + INTERVAL '1 day'");
            params.add(filter.toDt().trim());
        }
        sql.append(" ORDER BY o.order_date DESC NULLS LAST, o.id DESC, i.id ASC");
        return new Query(sql.toString(), params);
    }

    private void add(StringBuilder sql, List<Object> params, String column, String value) {
        if (!blank(value)) {
            sql.append(" AND ").append(column).append(" = ?");
            params.add(value.trim());
        }
    }

    private OrderExcelItem mapItem(ResultSet rs, int rowNum) throws SQLException {
        return new OrderExcelItem(
                rs.getLong("normalized_order_id"), rs.getString("mall_name"), rs.getString("mall_account"),
                rs.getString("order_no"), rs.getString("order_item_no"), offset(rs, "order_date"),
                offset(rs, "paid_at"), rs.getString("buyer_name"), rs.getString("receiver_name"),
                rs.getString("receiver_tel"), rs.getString("zip_code"), rs.getString("address"),
                rs.getString("address_detail"), rs.getString("product_code"), rs.getString("product_name"),
                rs.getString("option_name"), nullableInt(rs, "quantity"), rs.getBigDecimal("unit_price"),
                rs.getBigDecimal("order_amount"), rs.getBigDecimal("delivery_fee"), rs.getString("order_status"),
                rs.getString("claim_status"), rs.getString("delivery_status"), rs.getString("delivery_company"),
                rs.getString("tracking_number"), offset(rs, "collected_at"), rs.getString("channel_cd"),
                rs.getInt("item_count"));
    }

    private byte[] workbook(List<OrderExcelItem> items) {
        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            workbook.setCompressTempFiles(true);
            Sheet sheet = workbook.createSheet("주문");
            sheet.createFreezePane(0, 1);
            CellStyle header = headerStyle(workbook);
            CellStyle date = dateStyle(workbook);
            CellStyle number = numberStyle(workbook);
            Row headerRow = sheet.createRow(0);
            for (int column = 0; column < HEADERS.length; column++) {
                Cell cell = headerRow.createCell(column);
                cell.setCellValue(HEADERS[column]);
                cell.setCellStyle(header);
                sheet.setColumnWidth(column, Math.min(columnWidth(column), 255) * 256);
            }
            int rowIndex = 1;
            for (OrderExcelItem item : items) {
                Row row = sheet.createRow(rowIndex++);
                int c = 0;
                string(row, c++, item.mallName()); string(row, c++, item.mallAccount());
                string(row, c++, item.orderNo()); string(row, c++, item.orderItemNo());
                date(row, c++, item.orderDate(), date); date(row, c++, item.paidAt(), date);
                string(row, c++, item.buyerName()); string(row, c++, item.receiverName());
                string(row, c++, item.receiverTel()); string(row, c++, item.zipCode());
                string(row, c++, item.address()); string(row, c++, item.addressDetail());
                string(row, c++, item.productCode()); string(row, c++, item.productName());
                string(row, c++, item.optionName()); integer(row, c++, item.quantity(), number);
                decimal(row, c++, item.salePrice(), number); decimal(row, c++, item.orderAmount(), number);
                decimal(row, c++, item.deliveryFee(), number); string(row, c++, item.orderStatus());
                string(row, c++, item.claimStatus()); string(row, c++, item.deliveryStatus());
                string(row, c++, item.deliveryCompany()); string(row, c++, item.trackingNumber());
                date(row, c, item.collectedAt(), date);
            }
            sheet.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(0, Math.max(0, items.size()), 0, HEADERS.length - 1));
            workbook.write(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("failed to create order xlsx", exception);
        }
    }

    private CellStyle headerStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        Font font = workbook.createFont(); font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex());
        style.setFont(font);
        return style;
    }

    private CellStyle dateStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setDataFormat(workbook.createDataFormat().getFormat("yyyy-mm-dd hh:mm:ss"));
        return style;
    }

    private CellStyle numberStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setDataFormat(workbook.createDataFormat().getFormat("#,##0"));
        return style;
    }

    private void string(Row row, int column, String value) { row.createCell(column).setCellValue(text(value)); }
    private void integer(Row row, int column, Integer value, CellStyle style) {
        Cell cell = row.createCell(column); if (value != null) cell.setCellValue(value); cell.setCellStyle(style);
    }
    private void decimal(Row row, int column, BigDecimal value, CellStyle style) {
        Cell cell = row.createCell(column); if (value != null) cell.setCellValue(value.doubleValue()); cell.setCellStyle(style);
    }
    private void date(Row row, int column, OffsetDateTime value, CellStyle style) {
        Cell cell = row.createCell(column);
        if (value != null) cell.setCellValue(java.util.Date.from(value.toInstant()));
        cell.setCellStyle(style);
    }
    private int columnWidth(int column) {
        return switch (column) { case 10, 11, 13, 14 -> 28; case 4, 5, 24 -> 20; default -> 16; };
    }
    private Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column); return rs.wasNull() ? null : value;
    }
    private OffsetDateTime offset(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column); return value == null ? null : value.toInstant().atOffset(java.time.ZoneOffset.UTC);
    }
    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("failed to serialize export log", exception); }
    }
    private boolean blank(String value) { return value == null || value.isBlank(); }
    private String text(String value) { return value == null ? "" : value; }

    private record Query(String sql, List<Object> params) {}
    public record ExportedFile(String exportId, String fileName, byte[] content) {}
}
