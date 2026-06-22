package com.bizbee.hub.order;

import com.bizbee.hub.support.IntegrationTestDatabase;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "RUN_DB_INTEGRATION_TESTS", matches = "true")
class OrderExportRowMapperIntegrationTest {

    private JdbcTemplate jdbcTemplate;
    private OrderExportServiceImpl orderExportService;
    private TransactionTemplate transactionTemplate;
    private String userPrefix;
    private String requestPrefix;
    private String orderPrefix;

    @BeforeEach
    void setUp() {
        DataSource dataSource = dataSource();
        jdbcTemplate = new JdbcTemplate(dataSource);
        orderExportService = new OrderExportServiceImpl(jdbcTemplate);
        transactionTemplate = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        userPrefix = "itusr-" + shortId();
        requestPrefix = "it-export-" + shortId();
        orderPrefix = "IT-ORDER-" + shortId();
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update(
                "DELETE FROM hub_collected_order WHERE request_key LIKE ? OR channel_order_id LIKE ?",
                requestPrefix + "%",
                orderPrefix + "%"
        );
        jdbcTemplate.update(
                "DELETE FROM users WHERE username LIKE ?",
                userPrefix + "%"
        );
    }

    /**
     * 주문, 배송지, 품목 데이터가 있을 때 OrderExportItem의 주문번호, 상태, 주문일시, 수령자, 상품명, 수량, 주문금액, raw JSON이 정상 매핑되는지 검증합니다.
     */
    @Test
    void getOrdersForUserMapsNormalizedOrderWithDeliveryAndFirstItem() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long orderId = insertOrder(
                    userId,
                    "GODO",
                    orderPrefix + "-001",
                    "PAID",
                    "2026-06-18 10:30:15+09",
                    "12500.00",
                    """
                            {"channel":"GODO","orderNo":"001"}
                            """
            );
            insertDelivery(orderId, "홍길동");
            insertItem(orderId, "item-002", "두 번째 상품", 2);
            insertItem(orderId, "item-001", "첫 번째 상품", 1);

            OrderExportResponse response = orderExportService.getOrdersForUser(
                    userId,
                    "GODO",
                    "20260618",
                    "20260618",
                    1,
                    50
            );

            assertThat(response.responseCode()).isEqualTo(200);
            assertThat(response.total()).isEqualTo(1);
            assertThat(response.page()).isEqualTo(1);
            assertThat(response.size()).isEqualTo(50);
            assertThat(response.generatedAt()).matches("\\d{14}");
            assertThat(response.orders()).hasSize(1);

            OrderExportItem item = response.orders().get(0);
            assertThat(item.requestId()).hasSize(36);
            assertThat(item.requestKey()).startsWith(requestPrefix);
            assertThat(item.jobType()).isEqualTo("ORDER_COLLECT");
            assertThat(item.sourceErp()).isEqualTo("HUB");
            assertThat(item.channelCd()).isEqualTo("GODO");
            assertThat(item.frDt()).isEqualTo("20260618");
            assertThat(item.toDt()).isEqualTo("20260618");
            assertThat(item.orderNo()).isEqualTo(orderPrefix + "-001");
            assertThat(item.orderStatus()).isEqualTo("PAID");
            assertThat(item.orderDate()).isEqualTo("20260618103015");
            assertThat(item.receiverName()).isEqualTo("홍길동");
            assertThat(item.productName()).isEqualTo("두 번째 상품");
            assertThat(item.quantity()).isEqualTo(2);
            assertThat(item.orderAmount()).isEqualTo(12500L);
            assertThat(item.rawOrder()).contains("\"channel\": \"GODO\"");
            assertThat(item.savedAt()).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");
            return null;
        });
    }

    /**
     * 배송/품목이 없거나 금액/수량이 null일 때 빈 문자열 또는 null로 안전하게 내려가는지 검증합니다.
     */
    @Test
    void getOrdersForUserMapsNullableNumericAndMissingJoinValuesSafely() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            insertOrder(
                    userId,
                    "NAVER_RSS",
                    orderPrefix + "-002",
                    null,
                    "2026-06-18 15:00:00+09",
                    null,
                    "{}"
            );

            OrderExportResponse response = orderExportService.getOrdersForUser(
                    userId,
                    "",
                    "20260618",
                    "20260618",
                    1,
                    50
            );

            assertThat(response.total()).isEqualTo(1);
            assertThat(response.orders()).hasSize(1);

            OrderExportItem item = response.orders().get(0);
            assertThat(item.channelCd()).isEqualTo("NAVER_RSS");
            assertThat(item.orderStatus()).isEmpty();
            assertThat(item.receiverName()).isEmpty();
            assertThat(item.productName()).isEmpty();
            assertThat(item.quantity()).isNull();
            assertThat(item.orderAmount()).isNull();
            return null;
        });
    }

    /**
     * 외부 API가 현재 사용자, 채널, 기간 조건으로만 주문을 조회하는지 검증합니다. 다른 사용자/다른 채널/기간 밖 주문이 섞이지 않는지 보는 테스트예요.
     */
    @Test
    void getOrdersForUserFiltersByUserChannelAndDateRange() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            long otherUserId = insertUser();
            insertOrder(userId, "GODO", orderPrefix + "-in-range", "PAID", "2026-06-18 09:00:00+09", "1000.00", "{}");
            insertOrder(userId, "GODO", orderPrefix + "-out-of-range", "PAID", "2026-06-17 09:00:00+09", "1000.00", "{}");
            insertOrder(userId, "OTHER", orderPrefix + "-other-channel", "PAID", "2026-06-18 09:00:00+09", "1000.00", "{}");
            insertOrder(otherUserId, "GODO", orderPrefix + "-other-user", "PAID", "2026-06-18 09:00:00+09", "1000.00", "{}");

            OrderExportResponse response = orderExportService.getOrdersForUser(
                    userId,
                    "GODO",
                    "20260618",
                    "20260618",
                    1,
                    50
            );

            assertThat(response.total()).isEqualTo(1);
            assertThat(response.orders())
                    .extracting(OrderExportItem::orderNo)
                    .containsExactly(orderPrefix + "-in-range");
            return null;
        });
    }

    /**
     * 이미저장된 수집된 데이터가 있을 때 최신 상태를 내려주는지 테스트
     */
    @Test
    void getOrdersForUserReturnsLatestStatusWhenSameOrderIsUpdated() {
        inRollbackTransaction(() -> {
            long userId = insertUser();
            String channelOrderId = orderPrefix + "-status-change";
            long orderId = insertOrder(
                    userId,
                    "GODO",
                    channelOrderId,
                    "PAID",
                    "2026-06-18 11:00:00+09",
                    "1000.00",
                    """
                            {"version":1}
                            """
            );

            updateOrderAsIfSameChannelOrderArrivedAgain(
                    orderId,
                    "READY_TO_SHIP",
                    "2000.00",
                    """
                            {"version":2}
                            """
            );

            OrderExportResponse response = orderExportService.getOrdersForUser(
                    userId,
                    "GODO",
                    "20260618",
                    "20260618",
                    1,
                    50
            );

            assertThat(response.total()).isEqualTo(1);
            assertThat(response.orders()).hasSize(1);

            OrderExportItem item = response.orders().get(0);
            assertThat(item.orderNo()).isEqualTo(channelOrderId);
            assertThat(item.orderStatus()).isEqualTo("READY_TO_SHIP");
            assertThat(item.orderAmount()).isEqualTo(2000L);
            assertThat(item.rawOrder()).contains("\"version\": 2");
            return null;
        });
    }

    private DataSource dataSource() {
        return IntegrationTestDatabase.dataSource();
    }

    private <T> T inRollbackTransaction(Supplier<T> action) {
        return transactionTemplate.execute(status -> {
            try {
                return action.get();
            } finally {
                status.setRollbackOnly();
            }
        });
    }

    private long insertUser() {
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO users (username, password) VALUES (?, ?) RETURNING id",
                Long.class,
                userPrefix + "-" + shortId(),
                "integration-test-password"
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert test user");
        }
        return id;
    }

    private long insertOrder(
            long userId,
            String channelCd,
            String channelOrderId,
            String orderStatus,
            String orderDate,
            String orderAmount,
            String rawPayload
    ) {
        Long id = jdbcTemplate.queryForObject(
                """
                        INSERT INTO hub_collected_order (
                            user_id,
                            request_id,
                            request_key,
                            source_erp,
                            channel_cd,
                            mall_key,
                            channel_order_id,
                            order_status,
                            order_date,
                            collected_at,
                            order_amount,
                            raw_payload,
                            created_at,
                            updated_at
                        ) VALUES (
                            ?,
                            ?,
                            ?,
                            'HUB',
                            ?,
                            ?,
                            ?,
                            ?,
                            CAST(? AS timestamptz),
                            NOW(),
                            CAST(? AS numeric),
                            CAST(? AS jsonb),
                            NOW(),
                            NOW()
                        )
                        RETURNING id
                        """,
                Long.class,
                userId,
                UUID.randomUUID().toString(),
                requestPrefix + "-" + shortId(),
                channelCd,
                channelCd,
                channelOrderId,
                orderStatus,
                orderDate,
                orderAmount,
                rawPayload
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert order test row");
        }
        return id;
    }

    private void insertDelivery(long orderId, String receiverName) {
        jdbcTemplate.update(
                """
                        INSERT INTO hub_collected_order_delivery (
                            order_id,
                            receiver_name,
                            raw_payload,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, '{}'::jsonb, NOW(), NOW())
                        """,
                orderId,
                receiverName
        );
    }

    private void insertItem(long orderId, String channelOrderItemId, String productName, int quantity) {
        jdbcTemplate.update(
                """
                        INSERT INTO hub_collected_order_item (
                            order_id,
                            channel_order_item_id,
                            product_name,
                            quantity,
                            raw_payload,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, '{}'::jsonb, NOW(), NOW())
                        """,
                orderId,
                channelOrderItemId,
                productName,
                quantity
        );
    }

    private void updateOrderAsIfSameChannelOrderArrivedAgain(
            long orderId,
            String orderStatus,
            String orderAmount,
            String rawPayload
    ) {
        jdbcTemplate.update(
                """
                        UPDATE hub_collected_order
                        SET request_id = ?,
                            request_key = ?,
                            order_status = ?,
                            order_amount = CAST(? AS numeric),
                            raw_payload = CAST(? AS jsonb),
                            updated_at = NOW()
                        WHERE id = ?
                        """,
                UUID.randomUUID().toString(),
                requestPrefix + "-updated-" + shortId(),
                orderStatus,
                orderAmount,
                rawPayload,
                orderId
        );
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
