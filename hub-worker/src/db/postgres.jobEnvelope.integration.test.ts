import dotenv from "dotenv";
import { jest } from "@jest/globals";
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
type NormalizeModule = typeof import("../channels/orderNormalize/OrderNormalizeHandler.js");
type ErpModule = typeof import("../channels/erp/ErpApplyHandler.js");

describeIntegration("job envelope relationship fields", () => {
  let db: PostgresModule;
  let normalizeModule: NormalizeModule;
  let erpModule: ErpModule;
  let pool: pg.Pool;
  let userId: number;
  let corpId: number;
  let channelAccountId: number;

  const collectRequestId = `collect-envelope-${Date.now()}`;
  const correlationId = `correlation-${Date.now()}`;

  beforeAll(async () => {
    await setupWorkerIntegrationContainers();
    pool = createIntegrationPgPool();
    const user = await pool.query<{ id: number }>(
      `
        INSERT INTO users (username, password)
        VALUES ($1, 'test-password')
        ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
        RETURNING id
      `,
      [`job-envelope-${Date.now()}`]
    );
    userId = Number(user.rows[0].id);
    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
    normalizeModule = await import("../channels/orderNormalize/OrderNormalizeHandler.js");
    erpModule = await import("../channels/erp/ErpApplyHandler.js");
    const identity = await pool.query<{ corp_id: number }>(
      "SELECT corp_id FROM users WHERE id = $1",
      [userId]
    );
    corpId = Number(identity.rows[0].corp_id);
    const account = await pool.query<{ id: number }>(
      `
        INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
        VALUES ($1, $2, 'MOCK_MALL', 'Envelope pipeline account', 'Y')
        ON CONFLICT (corp_id, mall_key) WHERE mall_key = 'MOCK_MALL'
        DO UPDATE SET use_yn = 'Y'
        RETURNING id
      `,
      [corpId, userId]
    );
    channelAccountId = Number(account.rows[0].id);
  }, 120_000);

  afterAll(async () => {
    await pool?.query("DELETE FROM hub_erp_apply_result WHERE correlation_id = $1", [correlationId]);
    await pool?.query("DELETE FROM hub_collected_order WHERE request_id = $1", [collectRequestId]);
    await pool?.query("DELETE FROM hub_collected_order WHERE user_id = $1 AND channel_order_id LIKE 'WAIT-%'", [userId]);
    await pool?.query("DELETE FROM hub_user_setting WHERE user_id = $1", [userId]);
    await pool?.query("DELETE FROM hub_order_normalize_checkpoint WHERE request_id = $1", [collectRequestId]);
    await pool?.query(
      "DELETE FROM hub_job_outbox WHERE payload ->> 'correlationId' = $1",
      [correlationId]
    );
    await pool?.query("DELETE FROM hub_job WHERE correlation_id = $1", [correlationId]);
    await pool?.query("DELETE FROM hub_job_result WHERE request_id = $1", [collectRequestId]);
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 120_000);

  it("inherits the collection correlation id when creating ORDER_NORMALIZE", async () => {
    await pool.query(`
      INSERT INTO hub_user_setting (user_id, auto_erp_apply, auto_news_collect)
      VALUES ($1, TRUE, FALSE)
      ON CONFLICT (user_id) DO UPDATE SET auto_erp_apply = TRUE, updated_at = NOW()
    `, [userId]);
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
        JSON.stringify({ userId, corpId, channelAccountId, channelCd: "MOCK_MALL", mallKey: "MOCK_MALL" }),
        correlationId
      ]
    );
    const collectMessage = {
      requestId: collectRequestId,
      requestKey: `collect-message-${Date.now()}`,
      sourceErp: "HUB",
      jobType: "ORDER_COLLECT",
      payload: { userId, corpId, channelAccountId, channelCd: "MOCK_MALL", mallKey: "MOCK_MALL" }
    };
    const rawOrder = {
      orderId: `ORDER-${Date.now()}`,
      orderStatus: "PAID",
      buyerName: "Pipeline Buyer",
      orderAmount: 15000,
      items: [{ channelOrderItemId: "ITEM-1", productName: "Pipeline Product", quantity: 1, unitPrice: 15000 }],
      receiverName: "Pipeline Receiver"
    };
    await pool.query("UPDATE hub_job SET status = 'PROCESSING' WHERE request_id = $1", [collectRequestId]);
    const completion = await db.completeOrderCollectWithNormalize(
      collectMessage,
      { channelCd: "MOCK_MALL", orders: [rawOrder] }
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

    await pool.query("UPDATE hub_job SET status = 'PROCESSING' WHERE request_id = $1", [normalizeJob?.requestId]);
    const normalizeHandler = new normalizeModule.OrderNormalizeHandler();
    await normalizeHandler.handle(normalizeJob!);
    const normalizeCompletion = await db.completeOrderNormalizeWithErpApply(normalizeJob!);
    expect(normalizeCompletion.succeeded).toBe(true);
    expect(normalizeCompletion.outboxCreated).toBe(true);
    const erpApplyJob = normalizeCompletion.erpApplyJob;
    expect(erpApplyJob).toMatchObject({
      jobType: "ERP_APPLY",
      parentJobId: normalizeJob?.requestId,
      causationId: normalizeJob?.requestId,
      correlationId,
      schemaVersion: "1.0",
      payloadVersion: "1.0"
    });
    expect(erpApplyJob?.payload).toMatchObject({
      sourceNormalizeJobId: normalizeJob?.requestId,
      corpId,
      userId,
      channelAccountId,
      channelCd: "MOCK_MALL",
      erpConnectionId: `MOCK-${corpId}`,
      operation: "CREATE"
    });
    const erpOutbox = await pool.query<{ partition_key: string; status: string }>(
      "SELECT partition_key, status FROM hub_job_outbox WHERE request_id = $1",
      [erpApplyJob?.requestId]
    );
    expect(erpOutbox.rows[0]).toEqual({
      partition_key: `erp-connection:${corpId}:MOCK-${corpId}`,
      status: "PENDING"
    });

    const normalized = await pool.query<{
      channel_order_id: string;
      buyer_name: string;
      item_count: string;
    }>(
      `
        SELECT o.channel_order_id, o.buyer_name,
               (SELECT COUNT(*) FROM hub_collected_order_item i WHERE i.order_id = o.id)::text AS item_count
        FROM hub_collected_order o
        WHERE o.request_id = $1
      `,
      [collectRequestId]
    );
    expect(normalized.rows[0]).toEqual({
      channel_order_id: rawOrder.orderId,
      buyer_name: "Pipeline Buyer",
      item_count: "1"
    });
    const normalizeStatus = await pool.query<{ status: string }>(
      "SELECT status FROM hub_job WHERE request_id = $1",
      [normalizeJob?.requestId]
    );
    expect(normalizeStatus.rows[0].status).toBe("SUCCESS");

    await pool.query("UPDATE hub_job SET status = 'PROCESSING' WHERE request_id = $1", [erpApplyJob?.requestId]);
    const applyMock = jest.fn(async () => ({
      erpDocumentNo: "MOCK-ERP-INTEGRATION-001",
      acceptedCount: 1,
      status: "APPLIED" as const
    }));
    const erpHandler = new erpModule.ErpApplyHandler({ apply: applyMock });
    await erpHandler.handle(erpApplyJob!);
    expect(await db.succeedJob(erpApplyJob!.requestId)).toBe(true);
    const erpResult = await pool.query<{
      status: string; erp_connection_id: string; attempt_count: number; erp_document_no: string;
    }>(
      `
        SELECT status, erp_connection_id, attempt_count, erp_document_no
        FROM hub_erp_apply_result WHERE request_id = $1
      `,
      [erpApplyJob?.requestId]
    );
    expect(erpResult.rows[0]).toMatchObject({
      status: "APPLIED",
      erp_connection_id: `MOCK-${corpId}`,
      attempt_count: 1
    });
    expect(erpResult.rows[0].erp_document_no).toMatch(/^MOCK-ERP-/);

    await erpHandler.handle(erpApplyJob!);
    const duplicateResult = await pool.query<{ count: string; max_attempt: number }>(
      `
        SELECT COUNT(*)::text AS count, MAX(attempt_count)::int AS max_attempt
        FROM hub_erp_apply_result WHERE idempotency_key = $1
      `,
      [erpApplyJob?.payload.idempotencyKey]
    );
    expect(duplicateResult.rows[0]).toEqual({ count: "1", max_attempt: 1 });
    expect(applyMock).toHaveBeenCalledTimes(1);

    const failedErpRequestId = `erp-fail-${Date.now()}`;
    const failedPayload = {
      ...erpApplyJob!.payload,
      idempotencyKey: `failed-${erpApplyJob!.payload.idempotencyKey}`,
      mockFail: true,
      mockErrorCode: "ERP_500"
    };
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id, request_key, channel_cd, status, payload, retry_count,
          job_type, source_erp, parent_job_id, correlation_id, causation_id,
          schema_version, payload_version, created_at, updated_at
        ) VALUES (
          $1, $2, 'MOCK_MALL', 'PROCESSING', $3::jsonb, 0,
          'ERP_APPLY', 'HUB', $4, $5, $4, '1.0', '1.0', NOW(), NOW()
        )
      `,
      [
        failedErpRequestId,
        `ERP_APPLY_FAIL_${normalizeJob?.requestId}`,
        JSON.stringify(failedPayload),
        normalizeJob?.requestId,
        correlationId
      ]
    );
    const failedErpJob = {
      ...erpApplyJob!,
      requestId: failedErpRequestId,
      requestKey: `ERP_APPLY_FAIL_${normalizeJob?.requestId}`,
      payload: failedPayload
    };
    const failingErpHandler = new erpModule.ErpApplyHandler();
    await expect(failingErpHandler.handle(failedErpJob)).rejects.toMatchObject({ code: "ERP_500" });
    const failedResult = await pool.query<{
      status: string; error_code: string; error_message: string; request_id: string; correlation_id: string;
    }>(
      `
        SELECT status, error_code, error_message, request_id, correlation_id
        FROM hub_erp_apply_result WHERE idempotency_key = $1
      `,
      [failedPayload.idempotencyKey]
    );
    expect(failedResult.rows[0]).toMatchObject({
      status: "FAILED",
      error_code: "ERP_500",
      error_message: "Mock ERP apply failed",
      request_id: failedErpRequestId,
      correlation_id: correlationId
    });

    const retryDecision = await db.retryOrFailJob(failedErpRequestId, "Mock ERP apply failed");
    expect(retryDecision.status).toBe("RETRY");
    const retriedJob = await pool.query<{
      job_type: string; status: string; payload: Record<string, unknown>;
      parent_job_id: string; causation_id: string; correlation_id: string;
    }>(
      `
        SELECT job_type, status, payload, parent_job_id, causation_id, correlation_id
        FROM hub_job WHERE request_id = $1
      `,
      [failedErpRequestId]
    );
    expect(retriedJob.rows[0]).toMatchObject({
      job_type: "ERP_APPLY",
      status: "QUEUED",
      payload: failedPayload,
      parent_job_id: normalizeJob?.requestId,
      causation_id: normalizeJob?.requestId,
      correlation_id: correlationId
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

  it("completes ORDER_NORMALIZE without ERP_APPLY when the setting is missing", async () => {
    await pool.query("DELETE FROM hub_user_setting WHERE user_id = $1", [userId]);
    const sourceRequestId = `collect-manual-erp-${Date.now()}`;
    const normalizeRequestId = `normalize-manual-erp-${Date.now()}`;
    const normalizeRequestKey = `NORMALIZE_${sourceRequestId}`;
    await pool.query(`
      INSERT INTO hub_collected_order (
        corp_id, channel_account_id, user_id, request_id, request_key, source_erp,
        channel_cd, mall_key, channel_order_id, order_status, raw_payload
      ) VALUES ($1, $2, $3, $4, $5, 'HUB', 'MOCK_MALL', 'MOCK_MALL', $6, 'PAID', '{}'::jsonb)
    `, [corpId, channelAccountId, userId, sourceRequestId, `collect-key-${Date.now()}`, `WAIT-${Date.now()}`]);
    const payload = {
      sourceRequestId, userId, corpId, channelAccountId,
      channelCd: "MOCK_MALL", mallKey: "MOCK_MALL"
    };
    await pool.query(`
      INSERT INTO hub_job (
        request_id, request_key, channel_cd, status, payload, retry_count,
        job_type, source_erp, parent_job_id, correlation_id, causation_id,
        schema_version, payload_version, created_at, updated_at
      ) VALUES (
        $1, $2, 'MOCK_MALL', 'PROCESSING', $3::jsonb, 0,
        'ORDER_NORMALIZE', 'HUB', $4, $5, $4, '1.0', '1.0', NOW(), NOW()
      )
    `, [normalizeRequestId, normalizeRequestKey, JSON.stringify(payload), sourceRequestId, correlationId]);

    const completion = await db.completeOrderNormalizeWithErpApply({
      requestId: normalizeRequestId,
      requestKey: normalizeRequestKey,
      sourceErp: "HUB",
      jobType: "ORDER_NORMALIZE",
      correlationId,
      payload
    });

    expect(completion).toEqual({
      succeeded: true,
      erpApplyJob: null,
      outboxCreated: false,
      erpAutoApplySkipped: true
    });
    const state = await pool.query<{ status: string; child_count: string; outbox_count: string }>(`
      SELECT
        (SELECT status FROM hub_job WHERE request_id = $1) AS status,
        (SELECT COUNT(*) FROM hub_job WHERE parent_job_id = $1 AND job_type = 'ERP_APPLY')::text AS child_count,
        (SELECT COUNT(*) FROM hub_job_outbox WHERE event_type = 'ERP_APPLY' AND payload ->> 'parentJobId' = $1)::text AS outbox_count
    `, [normalizeRequestId]);
    expect(state.rows[0]).toEqual({ status: "SUCCESS", child_count: "0", outbox_count: "0" });
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
