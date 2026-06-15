import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

type PostgresModule = typeof import("./postgres.js");

const { Pool } = pg;

function createPool(): pg.Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DATABASE ?? "hub_db",
    user: process.env.POSTGRES_USER ?? "hub",
    password: process.env.POSTGRES_PASSWORD,
    options: "-c timezone=Asia/Seoul"
  });
}

describeIntegration("normalized order idempotency", () => {
  let db: PostgresModule;
  let pool: pg.Pool;
  let userId: number;

  const username = "test_order_dedup_user";
  const channelCd = "TEST_DEDUP";
  const channelOrderId = `MOCK-DEDUP-${Date.now()}`;

  beforeAll(async () => {
    pool = createPool();

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
  });

  afterAll(async () => {
    await pool?.query(
      "DELETE FROM hub_collected_order WHERE channel_cd = $1 AND channel_order_id = $2",
      [channelCd, channelOrderId]
    );
    await pool?.query("DELETE FROM users WHERE username = $1", [username]);
    await db?.closePostgresPool();
    await pool?.end();
  });

  it("updates an existing normalized order when the same channel order arrives again", async () => {
    const firstId = await db.upsertNormalizedOrder({
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
});
