package hub.order.service;

import hub.order.dto.response.OrderExportItem;
import hub.order.dto.response.OrderExportResponse;
import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderExportServiceImpl implements OrderExportService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter GENERATED_AT_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final JdbcTemplate jdbcTemplate;

    @Override
    public OrderExportResponse getOrders(String channelCd, String frDt, String toDt, int page, int size) {
        return getOrdersInternal(null, channelCd, frDt, toDt, page, size);
    }

    @Override
    public OrderExportResponse getOrdersForUser(Long userId, String channelCd, String frDt, String toDt, int page, int size) {
        if (userId == null) {
            throw new IllegalArgumentException("userId is required");
        }
        return getOrdersInternal(userId, channelCd, frDt, toDt, page, size);
    }

    private OrderExportResponse getOrdersInternal(Long userId, String channelCd, String frDt, String toDt, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(size, 200));
        int offset = (safePage - 1) * safeSize;
        String channelParam = blankToNull(channelCd);
        String frDtParam = blankToNull(frDt);
        String toDtParam = blankToNull(toDt);

        long total = countOrders(userId, channelParam, frDtParam, toDtParam);
        List<OrderExportItem> orders = selectOrders(userId, channelParam, frDtParam, toDtParam, safeSize, offset);

        return new OrderExportResponse(200, orders, total, safePage, safeSize, generatedAt());
    }

    private long countOrders(Long userId, String channelCd, String frDt, String toDt) {
        List<Object> params = new ArrayList<>();
        String sql = """
                SELECT COUNT(*)::bigint
                FROM hub_collected_order o
                WHERE 1 = 1
                """;
        sql += addFilters(userId, channelCd, frDt, toDt, params);

        Long count = jdbcTemplate.queryForObject(sql, Long.class, params.toArray());
        return count == null ? 0L : count;
    }

    private List<OrderExportItem> selectOrders(Long userId, String channelCd, String frDt, String toDt, int size, int offset) {
        List<Object> params = new ArrayList<>();
        // External clients read the normalized order tables, not hub_job_result.
        // Raw JSON is still included for traceability, but public fields come
        // from the channel-independent order model.
        String sql = """
                SELECT
                    o.request_id,
                    o.request_key,
                    'ORDER_COLLECT' AS job_type,
                    o.source_erp,
                    o.channel_cd,
                    o.channel_order_id AS order_no,
                    COALESCE(o.order_status, '') AS order_status,
                    to_char(o.order_date AT TIME ZONE 'Asia/Seoul', 'YYYYMMDDHH24MISS') AS order_date,
                    COALESCE(d.receiver_name, '') AS receiver_name,
                    COALESCE(i.product_name, '') AS product_name,
                    i.quantity,
                    o.order_amount::bigint AS order_amount,
                    o.raw_payload::text AS raw_order,
                    to_char(o.collected_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS saved_at
                FROM hub_collected_order o
                LEFT JOIN hub_collected_order_delivery d ON d.order_id = o.id
                LEFT JOIN LATERAL (
                    SELECT product_name, quantity
                    FROM hub_collected_order_item
                    WHERE order_id = o.id
                    ORDER BY id ASC
                    LIMIT 1
                ) i ON TRUE
                WHERE 1 = 1
                """;
        sql += addFilters(userId, channelCd, frDt, toDt, params);
        sql += """
                ORDER BY o.order_date DESC NULLS LAST, o.id DESC
                LIMIT ? OFFSET ?
                """;
        params.add(size);
        params.add(offset);

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new OrderExportItem(
                        rs.getString("request_id"),
                        rs.getString("request_key"),
                        rs.getString("job_type"),
                        rs.getString("source_erp"),
                        rs.getString("channel_cd"),
                        frDt == null ? "" : frDt,
                        toDt == null ? "" : toDt,
                        rs.getString("order_no"),
                        rs.getString("order_status"),
                        rs.getString("order_date"),
                        rs.getString("receiver_name"),
                        rs.getString("product_name"),
                        getNullableInteger(rs.getInt("quantity"), rs.wasNull()),
                        getNullableLong(rs.getLong("order_amount"), rs.wasNull()),
                        rs.getString("raw_order"),
                        rs.getString("saved_at")
                ),
                params.toArray()
        );
    }

    private String addFilters(Long userId, String channelCd, String frDt, String toDt, List<Object> params) {
        StringBuilder sql = new StringBuilder();
        if (userId != null) {
            sql.append(" AND o.user_id = ?\n");
            params.add(userId);
        }
        if (channelCd != null) {
            sql.append(" AND o.channel_cd = ?\n");
            params.add(channelCd);
        }
        if (frDt != null) {
            sql.append(" AND o.order_date >= to_date(?, 'YYYYMMDD')\n");
            params.add(frDt);
        }
        if (toDt != null) {
            sql.append(" AND o.order_date < to_date(?, 'YYYYMMDD') + INTERVAL '1 day'\n");
            params.add(toDt);
        }
        return sql.toString();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Integer getNullableInteger(int value, boolean wasNull) {
        return wasNull ? null : value;
    }

    private Long getNullableLong(long value, boolean wasNull) {
        return wasNull ? null : value;
    }

    private String generatedAt() {
        return LocalDateTime.now(KST).format(GENERATED_AT_FORMATTER);
    }
}
