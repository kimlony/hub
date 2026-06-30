import dotenv from "dotenv";
import type pg from "pg";
import {
  createIntegrationPgPool,
  setupWorkerIntegrationContainers,
  stopWorkerIntegrationContainers
} from "../test/containers.js";

dotenv.config();

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

type PostgresModule = typeof import("./postgres.js");

describeIntegration("normalized order idempotency", () => {
  let db: PostgresModule;
  let pool: pg.Pool;
  let userId: number;
  let corpId: number;
  let channelAccountId: number;
  let secondChannelAccountId: number;

  const username = "test_order_dedup_user";
  const channelCd = "TEST_DEDUP";
  const channelOrderId = `MOCK-DEDUP-${Date.now()}`;

  beforeAll(async () => {
    await setupWorkerIntegrationContainers();
    pool = createIntegrationPgPool();

    // Integration setup mirrors the API auth schema enough for worker FK checks.
    // The test proves that repeated normalization of the same channel order is
    // idempotent and updates one row instead of creating duplicates.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(60) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const userResult = await pool.query<{ id: number }>(
      `
        INSERT INTO users (username, password)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET username = EXCLUDED.username
        RETURNING id
      `,
      [username, "test-password-hash"]
    );
    userId = userResult.rows[0].id;

    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
    const corpResult = await pool.query<{ corp_id: number }>(
      "SELECT corp_id FROM users WHERE id = $1",
      [userId]
    );
    corpId = Number(corpResult.rows[0].corp_id);
    const accountResult = await pool.query<{ id: number }>(
      `
        INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
        VALUES ($1, $2, 'TEST', 'Primary test account', 'Y'),
               ($1, $2, 'TEST', 'Secondary test account', 'Y')
        RETURNING id
      `,
      [corpId, userId]
    );
    channelAccountId = Number(accountResult.rows[0].id);
    secondChannelAccountId = Number(accountResult.rows[1].id);
  }, 120_000);

  afterAll(async () => {
    await pool?.query(
      "DELETE FROM hub_collected_order WHERE channel_cd = $1 AND channel_order_id = $2",
      [channelCd, channelOrderId]
    );
    await pool?.query("DELETE FROM users WHERE username = $1", [username]);
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 60_000);

  it("updates an existing normalized order when the same channel order arrives again", async () => {
    const firstId = await db.upsertNormalizedOrder({
      corpId,
      channelAccountId,
      userId,
      requestId: "dedup-source-001",
      requestKey: "DEDUP_SOURCE_001",
      sourceErp: "HUB_TEST",
      channelCd,
      mallKey: "TEST",
      channelOrderId,
      orderStatus: "PAYED",
      buyerName: "First Buyer",
      orderAmount: 1000,
      rawPayload: { version: 1 }
    });

    const secondId = await db.upsertNormalizedOrder({
      corpId,
      channelAccountId,
      userId,
      requestId: "dedup-source-002",
      requestKey: "DEDUP_SOURCE_002",
      sourceErp: "HUB_TEST",
      channelCd,
      mallKey: "TEST",
      channelOrderId,
      orderStatus: "READY_TO_SHIP",
      buyerName: "Updated Buyer",
      orderAmount: 2000,
      rawPayload: { version: 2 }
    });

    const result = await pool.query<{
      id: number;
      request_id: string;
      order_status: string;
      buyer_name: string;
      order_amount: string;
      raw_payload: { version: number };
    }>(
      `
        SELECT id, request_id, order_status, buyer_name, order_amount, raw_payload
        FROM hub_collected_order
        WHERE channel_cd = $1
          AND channel_order_id = $2
      `,
      [channelCd, channelOrderId]
    );

    expect(secondId).toBe(firstId);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      id: firstId,
      request_id: "dedup-source-002",
      order_status: "READY_TO_SHIP",
      buyer_name: "Updated Buyer",
      raw_payload: { version: 2 }
    });
    expect(Number(result.rows[0].order_amount)).toBe(2000);
  });

  it("keeps the same channel order id separate for different channel accounts", async () => {
    const secondAccountOrderId = await db.upsertNormalizedOrder({
      corpId,
      channelAccountId: secondChannelAccountId,
      userId,
      requestId: "dedup-source-account-002",
      requestKey: "DEDUP_SOURCE_ACCOUNT_002",
      sourceErp: "HUB_TEST",
      channelCd,
      mallKey: "TEST",
      channelOrderId,
      orderStatus: "PAYED",
      rawPayload: { account: 2 }
    });

    const result = await pool.query<{ channel_account_id: string }>(
      `
        SELECT channel_account_id
        FROM hub_collected_order
        WHERE channel_cd = $1 AND channel_order_id = $2
        ORDER BY channel_account_id
      `,
      [channelCd, channelOrderId]
    );

    expect(secondAccountOrderId).not.toBeNull();
    expect(result.rowCount).toBe(2);
    expect(result.rows.map((row) => Number(row.channel_account_id))).toEqual(
      [channelAccountId, secondChannelAccountId].sort((left, right) => left - right)
    );
  });
});
