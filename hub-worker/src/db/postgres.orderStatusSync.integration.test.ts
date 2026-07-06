import dotenv from "dotenv";
import type pg from "pg";
import {
  createIntegrationPgPool,
  setupWorkerIntegrationContainers,
  stopWorkerIntegrationContainers
} from "../test/containers.js";

dotenv.config();

const describeIntegration = process.env.RUN_INTEGRATION_TESTS === "true" ? describe : describe.skip;
type PostgresModule = typeof import("./postgres.js");

describeIntegration("order status sync persistence", () => {
  let db: PostgresModule;
  let pool: pg.Pool;
  let corpId: number;
  let userId: number;
  let channelAccountId: number;
  let orderId: number;
  const requestId = `status-sync-${Date.now()}`;
  const channelOrderId = `STATUS-ORDER-${Date.now()}`;

  beforeAll(async () => {
    await setupWorkerIntegrationContainers();
    pool = createIntegrationPgPool();
    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
    const corp = await pool.query<{ id: number }>(
      `
        INSERT INTO hub_corp (corp_cd, corp_name)
        VALUES ($1, 'Status sync integration corp')
        RETURNING id
      `,
      [`STATUS-SYNC-${Date.now()}`]
    );
    corpId = Number(corp.rows[0].id);
    const user = await pool.query<{ id: number }>(
      `
        INSERT INTO users (corp_id, username, password)
        VALUES ($1, $2, 'test-password')
        RETURNING id
      `,
      [corpId, `status-sync-user-${Date.now()}`]
    );
    userId = Number(user.rows[0].id);    const account = await pool.query<{ id: number }>(
      `
        INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
        VALUES ($1, $2, 'MOCK_MALL', 'Status sync account', 'Y')
        RETURNING id
      `,
      [corpId, userId]
    );
    channelAccountId = Number(account.rows[0].id);
    const order = await pool.query<{ id: number }>(
      `
        INSERT INTO hub_collected_order (
          corp_id, channel_account_id, user_id, source_erp, channel_cd, mall_key,
          channel_order_id, order_status, order_date, buyer_name, order_amount, raw_payload
        ) VALUES ($1, $2, $3, 'HUB', 'MOCK_MALL', 'MOCK_MALL',
                  $4, '결제완료', NOW(), 'Original Buyer', 55000, '{"original":true}'::jsonb)
        RETURNING id
      `,
      [corpId, channelAccountId, userId, channelOrderId]
    );
    orderId = Number(order.rows[0].id);
    await pool.query(
      `
        INSERT INTO hub_collected_order_item (
          order_id, channel_order_item_id, product_name, quantity, raw_payload
        ) VALUES ($1, $2, 'Original Product', 1, '{}'::jsonb)
      `,
      [orderId, `${channelOrderId}-1`]
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.query("DELETE FROM hub_collected_order WHERE id = $1", [orderId]);
    await pool?.query("DELETE FROM user_malls WHERE id = $1", [channelAccountId]);
    await pool?.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool?.query("DELETE FROM hub_corp WHERE id = $1", [corpId]);
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 120_000);

  it("updates only status fields, writes one history row, and skips the same state", async () => {
    const update = {
      channelOrderId,
      orderStatus: "배송중",
      deliveryStatus: "SHIPPED",
      deliveryCompany: "MOCK_DELIVERY",
      trackingNumber: "TRACK-001",
      rawPayload: { orderStatus: "SHIPPED" }
    };

    const first = await db.applyOrderStatusUpdates({
      requestId,
      channelAccountId,
      updates: [update]
    });
    const second = await db.applyOrderStatusUpdates({
      requestId,
      channelAccountId,
      updates: [update]
    });

    expect(first).toEqual({ fetchedCount: 1, updatedCount: 1, skippedCount: 0 });
    expect(second).toEqual({ fetchedCount: 1, updatedCount: 0, skippedCount: 1 });
    const stored = await pool.query<{
      order_status: string;
      buyer_name: string;
      order_amount: string;
      product_name: string;
      delivery_status: string;
    }>(
      `
        SELECT o.order_status, o.buyer_name, o.order_amount::text, i.product_name, d.delivery_status
        FROM hub_collected_order o
        JOIN hub_collected_order_item i ON i.order_id = o.id
        JOIN hub_collected_order_delivery d ON d.order_id = o.id
        WHERE o.id = $1
      `,
      [orderId]
    );
    expect(stored.rows[0]).toEqual(expect.objectContaining({
      order_status: "배송중",
      buyer_name: "Original Buyer",
      order_amount: "55000.00",
      product_name: "Original Product",
      delivery_status: "SHIPPED"
    }));
    const history = await pool.query<{
      before_order_status: string;
      after_order_status: string;
    }>("SELECT before_order_status, after_order_status FROM hub_order_status_history WHERE order_id = $1", [orderId]);
    expect(history.rows).toEqual([{
      before_order_status: "결제완료",
      after_order_status: "배송중"
    }]);
  });
});
