package hub.order;

import hub.order.dto.response.OrderExportItem;
import hub.order.dto.response.OrderExportResponse;
import hub.order.service.OrderExportService;
import hub.order.service.OrderExportServiceImpl;
import hub.support.IntegrationTestDatabase;
import java.util.function.Supplier;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
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
     * 정규화 주문과 배송지 및 상품 정보가 조회 응답으로 매핑되는지 검증한다.
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
            insertDelivery(orderId, "Receiver A");
            insertItem(orderId, "item-002", "Product B", 2);
            insertItem(orderId, "item-001", "Product A", 1);

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
            assertThat(item.receiverName()).isEqualTo("Receiver A");
            assertThat(item.productName()).isEqualTo("Product B");
            assertThat(item.quantity()).isEqualTo(2);
            assertThat(item.orderAmount()).isEqualTo(12500L);
            assertThat(item.rawOrder()).contains("\"channel\": \"GODO\"");
            assertThat(item.savedAt()).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");
            return null;
        });
    }

    /**
     * 선택 정보와 금액이 없어도 주문 조회 결과를 안전하게 매핑하는지 검증한다.
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
     * 회사와 채널 및 날짜 조건에 해당하는 주문만 조회하는지 검증한다.
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
     * 같은 회사 사용자가 동일한 회사 주문을 조회할 수 있는지 검증한다.
     */
    @Test
    void usersInSameCorpCanReadTheSameOrders() {
        inRollbackTransaction(() -> {
            long ownerUserId = insertUser();
            Long corpId = jdbcTemplate.queryForObject(
                    "SELECT corp_id FROM users WHERE id = ?", Long.class, ownerUserId);
            long colleagueUserId = insertUser(corpId);
            insertOrder(
                    ownerUserId,
                    "GODO",
                    orderPrefix + "-shared-corp",
                    "PAID",
                    "2026-06-18 12:00:00+09",
                    "15000.00",
                    "{}"
            );

            OrderExportResponse response = orderExportService.getOrdersForUser(
                    colleagueUserId,
                    "GODO",
                    "20260618",
                    "20260618",
                    1,
                    50
            );

            assertThat(response.total()).isEqualTo(1);
            assertThat(response.orders())
                    .extracting(OrderExportItem::orderNo)
                    .containsExactly(orderPrefix + "-shared-corp");
            return null;
        });
    }

    /**
     * 동일 주문이 갱신되면 최신 상태와 금액을 반환하는지 검증한다.
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
        String suffix = shortId();
        Long id = jdbcTemplate.queryForObject(
                """
                        WITH inserted_corp AS (
                            INSERT INTO hub_corp (corp_cd, corp_name)
                            VALUES (?, ?)
                            RETURNING id
                        )
                        INSERT INTO users (corp_id, username, password)
                        SELECT id, ?, ? FROM inserted_corp
                        RETURNING id
                        """,
                Long.class,
                "IT-CORP-" + suffix,
                "Integration Corp " + suffix,
                userPrefix + "-" + suffix,
                "integration-test-password"
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert test user");
        }
        return id;
    }

    private long insertUser(long corpId) {
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO users (corp_id, username, password) VALUES (?, ?, ?) RETURNING id",
                Long.class,
                corpId,
                userPrefix + "-" + shortId(),
                "integration-test-password"
        );
        if (id == null) {
            throw new IllegalStateException("failed to insert test user in corp");
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
        Long corpId = jdbcTemplate.queryForObject(
                "SELECT corp_id FROM users WHERE id = ?", Long.class, userId);
        Long channelAccountId = jdbcTemplate.query(
                "SELECT id FROM user_malls WHERE user_id = ? AND mall_key = ? ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getLong(1) : null,
                userId,
                channelCd
        );
        if (channelAccountId == null) {
            channelAccountId = jdbcTemplate.queryForObject(
                    """
                            INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
                            VALUES (?, ?, ?, ?, 'Y')
                            RETURNING id
                            """,
                    Long.class,
                    corpId,
                    userId,
                    channelCd,
                    channelCd + " integration account"
            );
        }
        Long id = jdbcTemplate.queryForObject(
                """
                        INSERT INTO hub_collected_order (
                            corp_id,
                            channel_account_id,
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
                corpId,
                channelAccountId,
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
