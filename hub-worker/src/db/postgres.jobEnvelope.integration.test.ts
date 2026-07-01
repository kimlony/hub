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
    await pool?.query(
      "DELETE FROM hub_job_outbox WHERE request_id IN (SELECT request_id FROM hub_job WHERE request_id = $1 OR parent_job_id = $1)",
      [collectRequestId]
    );
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

    const collectMessage = {
      requestId: collectRequestId,
      requestKey: `collect-message-${Date.now()}`,
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      payload: { userId: 1, channelCd: "MOCK_MALL", mallKey: "MOCK_MALL" }
    };
    await pool.query("UPDATE hub_job SET status = 'PROCESSING' WHERE request_id = $1", [collectRequestId]);
    const completion = await db.completeOrderCollectWithNormalize(
      collectMessage,
      { orders: [{ orderId: "ORDER-1" }] }
    );
    const normalizeJob = completion.normalizeJob;

    expect(normalizeJob).not.toBeNull();
    expect(completion.outboxCreated).toBe(true);
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

    const outbox = await pool.query<{
      request_id: string;
      event_type: string;
      partition_key: string;
      status: string;
      payload: Record<string, unknown>;
    }>(
      `
        SELECT request_id, event_type, partition_key, status, payload
        FROM hub_job_outbox
        WHERE request_id = $1
      `,
      [normalizeJob?.requestId]
    );
    expect(outbox.rows[0]).toMatchObject({
      request_id: normalizeJob?.requestId,
      event_type: "ORDER_NORMALIZE",
      partition_key: collectRequestId,
      status: "PENDING"
    });
    expect(outbox.rows[0].payload).toMatchObject({
      requestId: normalizeJob?.requestId,
      requestKey: normalizeJob?.requestKey,
      jobType: "ORDER_NORMALIZE",
      status: "QUEUED",
      parentJobId: collectRequestId,
      causationId: collectRequestId,
      correlationId
    });

    await pool.query("UPDATE hub_job SET status = 'PROCESSING' WHERE request_id = $1", [collectRequestId]);
    const duplicateCompletion = await db.completeOrderCollectWithNormalize(
      collectMessage,
      { orders: [{ orderId: "ORDER-1" }] }
    );
    expect(duplicateCompletion.normalizeJob?.requestId).toBe(normalizeJob?.requestId);
    expect(duplicateCompletion.outboxCreated).toBe(false);

    const counts = await pool.query<{ job_count: string; outbox_count: string }>(
      `
        SELECT
          (SELECT COUNT(*) FROM hub_job WHERE request_key = $1)::text AS job_count,
          (SELECT COUNT(*) FROM hub_job_outbox WHERE request_id = $2 AND event_type = 'ORDER_NORMALIZE')::text AS outbox_count
      `,
      [normalizeJob?.requestKey, normalizeJob?.requestId]
    );
    expect(counts.rows[0]).toEqual({ job_count: "1", outbox_count: "1" });
  });

  it("rolls back raw result, child job and outbox when completion fails", async () => {
    const failedRequestId = `collect-rollback-${Date.now()}`;
    const failedRequestKey = `collect-rollback-key-${Date.now()}`;
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id, request_key, channel_cd, status, payload, retry_count,
          job_type, source_erp, parent_job_id, correlation_id, causation_id,
          schema_version, payload_version, created_at, updated_at
        ) VALUES (
          $1, $2, 'MOCK_MALL', 'PROCESSING', '{}'::jsonb, 0,
          'ORDER_COLLECT', 'HUB', NULL, $1, NULL, '1.0', '1.0', NOW(), NOW()
        )
      `,
      [failedRequestId, failedRequestKey]
    );
    const cyclic: Record<string, unknown> = { orders: [{ orderId: "ROLLBACK-1" }] };
    cyclic.self = cyclic;

    await expect(db.completeOrderCollectWithNormalize({
      requestId: failedRequestId,
      requestKey: failedRequestKey,
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      payload: { channelCd: "MOCK_MALL" }
    }, cyclic)).rejects.toThrow();

    const state = await pool.query<{
      status: string;
      result_count: string;
      child_count: string;
      outbox_count: string;
    }>(
      `
        SELECT
          j.status,
          (SELECT COUNT(*) FROM hub_job_result WHERE request_id = $1)::text AS result_count,
          (SELECT COUNT(*) FROM hub_job WHERE parent_job_id = $1)::text AS child_count,
          (SELECT COUNT(*) FROM hub_job_outbox WHERE payload ->> 'parentJobId' = $1)::text AS outbox_count
        FROM hub_job j
        WHERE j.request_id = $1
      `,
      [failedRequestId]
    );
    expect(state.rows[0]).toEqual({
      status: "PROCESSING",
      result_count: "0",
      child_count: "0",
      outbox_count: "0"
    });
    await pool.query("DELETE FROM hub_job WHERE request_id = $1", [failedRequestId]);
  });
});
