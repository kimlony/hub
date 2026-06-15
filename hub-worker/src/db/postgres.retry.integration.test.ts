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

describeIntegration("job retry state transition", () => {
  let db: PostgresModule;
  let pool: pg.Pool;

  const retryRequestId = `retry-test-${Date.now()}`;
  const failedRequestId = `retry-failed-test-${Date.now()}`;

  beforeAll(async () => {
    pool = createPool();

    // Integration setup keeps the test focused on the retry transition. In the
    // running application this table is created by the API migration/schema.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hub_job (
        id BIGSERIAL PRIMARY KEY,
        request_id VARCHAR(100) UNIQUE NOT NULL,
        request_key VARCHAR(200),
        channel_cd VARCHAR(30),
        status VARCHAR(30) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        retry_count INT NOT NULL DEFAULT 0,
        error_message TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        job_type VARCHAR(100) NOT NULL DEFAULT 'ORDER_COLLECT',
        source_erp VARCHAR(100) NOT NULL DEFAULT 'HUB',
        next_retry_at TIMESTAMPTZ
      )
    `);

    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
  });

  afterAll(async () => {
    await pool?.query("DELETE FROM hub_job_log WHERE request_id = ANY($1)", [[retryRequestId, failedRequestId]]);
    await pool?.query("DELETE FROM hub_job WHERE request_id = ANY($1)", [[retryRequestId, failedRequestId]]);
    await db?.closePostgresPool();
    await pool?.end();
  });

  it("moves a processing job back to queued until max retry count is reached", async () => {
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id,
          request_key,
          channel_cd,
          status,
          payload,
          retry_count,
          job_type,
          source_erp,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, 'PROCESSING', '{}'::jsonb, 0, 'ORDER_COLLECT', 'HUB_TEST', NOW(), NOW())
      `,
      [retryRequestId, "RETRY_TEST_001", "TEST"]
    );

    const decision = await db.retryOrFailJob(retryRequestId, "temporary external API failure");

    const result = await pool.query<{
      status: string;
      retry_count: number;
      error_message: string;
      next_retry_at: Date | null;
      completed_at: Date | null;
    }>(
      `
        SELECT status, retry_count, error_message, next_retry_at, completed_at
        FROM hub_job
        WHERE request_id = $1
      `,
      [retryRequestId]
    );

    expect(decision.status).toBe("RETRY");
    expect(decision.retryCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      status: "QUEUED",
      retry_count: 1,
      error_message: "temporary external API failure",
      completed_at: null
    });
    expect(result.rows[0].next_retry_at).toBeInstanceOf(Date);
  });

  it("marks a processing job as failed after max retry count is reached", async () => {
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id,
          request_key,
          channel_cd,
          status,
          payload,
          retry_count,
          job_type,
          source_erp,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, 'PROCESSING', '{}'::jsonb, 3, 'ORDER_COLLECT', 'HUB_TEST', NOW(), NOW())
      `,
      [failedRequestId, "RETRY_FAILED_TEST_001", "TEST"]
    );

    const decision = await db.retryOrFailJob(failedRequestId, "permanent external API failure");

    const result = await pool.query<{
      status: string;
      retry_count: number;
      error_message: string;
      next_retry_at: Date | null;
      completed_at: Date | null;
    }>(
      `
        SELECT status, retry_count, error_message, next_retry_at, completed_at
        FROM hub_job
        WHERE request_id = $1
      `,
      [failedRequestId]
    );

    expect(decision.status).toBe("FAILED");
    expect(decision.retryCount).toBe(3);
    expect(result.rows[0]).toMatchObject({
      status: "FAILED",
      retry_count: 3,
      error_message: "permanent external API failure",
      next_retry_at: null
    });
    expect(result.rows[0].completed_at).toBeInstanceOf(Date);
  });
});
