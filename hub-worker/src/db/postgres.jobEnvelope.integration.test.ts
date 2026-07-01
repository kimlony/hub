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

describeIntegration("job envelope relationship fields", () => {
  let db: PostgresModule;
  let pool: pg.Pool;

  const collectRequestId = `collect-envelope-${Date.now()}`;
  const correlationId = `correlation-${Date.now()}`;

  beforeAll(async () => {
    await setupWorkerIntegrationContainers();
    pool = createIntegrationPgPool();
    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
  }, 120_000);

  afterAll(async () => {
    await pool?.query("DELETE FROM hub_job WHERE request_id = $1 OR parent_job_id = $1", [collectRequestId]);
    await pool?.query("DELETE FROM hub_job_result WHERE request_id = $1", [collectRequestId]);
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 120_000);

  it("inherits the collection correlation id when creating ORDER_NORMALIZE", async () => {
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id, request_key, channel_cd, status, payload, retry_count,
          job_type, source_erp, parent_job_id, correlation_id, causation_id,
          schema_version, payload_version, created_at, updated_at
        ) VALUES (
          $1, $2, 'MOCK_MALL', 'SUCCESS', $3::jsonb, 0,
          'ORDER_COLLECT', 'HUB', NULL, $4, NULL, '1.0', '1.0', NOW(), NOW()
        )
      `,
      [
        collectRequestId,
        `collect-envelope-key-${Date.now()}`,
        JSON.stringify({ userId: 1, channelCd: "MOCK_MALL", mallKey: "MOCK_MALL" }),
        correlationId
      ]
    );
    await pool.query(
      `
        INSERT INTO hub_job_result (
          request_id, request_key, job_type, source_erp, result_payload
        ) VALUES ($1, $2, 'ORDER_COLLECT', 'HUB', $3::jsonb)
      `,
      [collectRequestId, `collect-result-${Date.now()}`, JSON.stringify({ orders: [{ orderId: "ORDER-1" }] })]
    );

    const normalizeJob = await db.createNormalizeJobForResult({
      requestId: collectRequestId,
      requestKey: `collect-message-${Date.now()}`,
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      payload: { userId: 1, channelCd: "MOCK_MALL", mallKey: "MOCK_MALL" }
    });

    expect(normalizeJob).not.toBeNull();
    expect(normalizeJob).toMatchObject({
      jobType: "ORDER_NORMALIZE",
      parentJobId: collectRequestId,
      correlationId,
      causationId: collectRequestId,
      schemaVersion: "1.0",
      payloadVersion: "1.0"
    });

    const saved = await pool.query<{
      parent_job_id: string;
      correlation_id: string;
      causation_id: string;
      schema_version: string;
      payload_version: string;
    }>(
      `
        SELECT parent_job_id, correlation_id, causation_id, schema_version, payload_version
        FROM hub_job
        WHERE request_id = $1
      `,
      [normalizeJob?.requestId]
    );

    expect(saved.rows[0]).toEqual({
      parent_job_id: collectRequestId,
      correlation_id: correlationId,
      causation_id: collectRequestId,
      schema_version: "1.0",
      payload_version: "1.0"
    });
  });
});
