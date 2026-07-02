import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { logger } from "../logger.js";
import { resolveJobPartitionKey } from "../jobKeys.js";
import { getWorkerId } from "../workerIdentity.js";

type HubJobMessage = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey?: string;
  parentJobId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  schemaVersion?: string;
  payloadVersion?: string;
  payload?: Record<string, unknown>;
};

export type HubJobRow = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey: string;
  parentJobId: string | null;
  correlationId: string;
  causationId: string | null;
  schemaVersion: string;
  payloadVersion: string;
  payload: Record<string, unknown>;
};

export type RetryDecision = {
  status: "RETRY" | "FAILED" | "SKIPPED";
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt?: Date;
  retryable: boolean;
  reason?: "non_retryable" | "retry_exhausted";
};

export type SaveJobResultStatus = "INSERTED" | "SKIPPED";

type CapturedJobResult = {
  requestId: string;
  resultPayload?: Record<string, unknown>;
};

export type CompleteOrderCollectResult = {
  succeeded: boolean;
  normalizeJob: NormalizeJobInput | null;
  outboxCreated: boolean;
};

export type CompleteOrderNormalizeResult = {
  succeeded: boolean;
  erpApplyJob: NormalizeJobInput | null;
  outboxCreated: boolean;
};

export type NormalizedOrderForErp = {
  id: number;
  channelOrderId: string;
  orderStatus: string | null;
  orderAmount: string | null;
  buyerName: string | null;
  items: Array<Record<string, unknown>>;
};

export type JobLogLevel = "INFO" | "WARN" | "ERROR";

export type NewsItemInput = {
  source: string;
  category?: string;
  title: string;
  summary?: string;
  url?: string;
  corpName?: string;
  contentHash: string;
  publishedAt: Date;
};

export type NormalizeJobInput = {
  requestId: string;
  requestKey: string;
  sourceErp: string;
  jobType: string;
  parentJobId: string | null;
  correlationId: string;
  causationId: string | null;
  schemaVersion: string;
  payloadVersion: string;
  payload: Record<string, unknown>;
};

export type JobResultForNormalize = {
  requestId: string;
  requestKey: string;
  sourceErp: string;
  resultPayload: Record<string, unknown>;
  jobPayload: Record<string, unknown>;
};

const MAX_RETRY_COUNT = 3;
const DEFAULT_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
const RETRY_BACKOFF_MS = parseRetryBackoffMs();
const AES_SECRET = requiredEnv("HUB_AES_SECRET");
const LOCK_TTL_MINUTES = Number(process.env.JOB_LOCK_TTL_MINUTES ?? 30);
const WORKER_ID = getWorkerId();
const jobResultCapture = new AsyncLocalStorage<CapturedJobResult>();
const SCHEMA_INIT_LOCK_KEY = 2026060201;

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? "hub_db",
  user: process.env.POSTGRES_USER ?? "hub",
  password: requiredEnv("POSTGRES_PASSWORD"),
  options: "-c timezone=Asia/Seoul",
  max: 10
});

export async function ensurePostgresSchema(): Promise<void> {
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_INIT_LOCK_KEY]);
    locked = true;
    await ensurePostgresSchemaUnlocked();
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_INIT_LOCK_KEY]).catch((error: unknown) => {
        logger.warn({
          event: "POSTGRES_SCHEMA_LOCK_RELEASE_FAILED",
          err: error
        }, "Postgres schema init lock release failed");
      });
    }
    client.release();
  }
}

async function ensurePostgresSchemaUnlocked(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_corp (
      id BIGSERIAL PRIMARY KEY,
      corp_cd VARCHAR(50) UNIQUE NOT NULL,
      corp_name VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS corp_id BIGINT`);
  await pool.query(`
    INSERT INTO hub_corp (corp_cd, corp_name)
    SELECT 'LEGACY-' || id, username
    FROM users
    WHERE corp_id IS NULL
    ON CONFLICT (corp_cd) DO NOTHING
  `);
  await pool.query(`
    UPDATE users u
    SET corp_id = c.id
    FROM hub_corp c
    WHERE u.corp_id IS NULL
      AND c.corp_cd = 'LEGACY-' || u.id
  `);
  await pool.query(`ALTER TABLE users ALTER COLUMN corp_id SET NOT NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_malls (
      id BIGSERIAL PRIMARY KEY,
      corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mall_key VARCHAR(20) NOT NULL,
      account_name VARCHAR(100) NOT NULL,
      key VARCHAR(500),
      key2 VARCHAR(500),
      auth_key VARCHAR(500),
      mall_id VARCHAR(255),
      mall_pw VARCHAR(500),
      use_yn CHAR(1) NOT NULL DEFAULT 'Y',
      vendor_id VARCHAR(500)
    )
  `);
  await pool.query(`ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS id BIGSERIAL`);
  await pool.query(`ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS corp_id BIGINT`);
  await pool.query(`ALTER TABLE user_malls ADD COLUMN IF NOT EXISTS account_name VARCHAR(100)`);
  await pool.query(`
    UPDATE user_malls m
    SET corp_id = u.corp_id
    FROM users u
    WHERE m.user_id = u.id AND m.corp_id IS NULL
  `);
  await pool.query(`
    UPDATE user_malls
    SET account_name = mall_key || '-' || id
    WHERE account_name IS NULL OR BTRIM(account_name) = ''
  `);
  await pool.query(`ALTER TABLE user_malls ALTER COLUMN corp_id SET NOT NULL`);
  await pool.query(`ALTER TABLE user_malls ALTER COLUMN account_name SET NOT NULL`);
  await pool.query(`
    DO $$
    DECLARE
      id_attnum SMALLINT;
      current_key SMALLINT[];
    BEGIN
      SELECT attnum INTO id_attnum
      FROM pg_attribute
      WHERE attrelid = 'user_malls'::regclass AND attname = 'id';

      SELECT conkey INTO current_key
      FROM pg_constraint
      WHERE conrelid = 'user_malls'::regclass AND contype = 'p';

      IF current_key IS DISTINCT FROM ARRAY[id_attnum] THEN
        ALTER TABLE user_malls DROP CONSTRAINT IF EXISTS user_malls_pkey;
        ALTER TABLE user_malls ADD CONSTRAINT user_malls_pkey PRIMARY KEY (id);
      END IF;
    END $$
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_malls_corp ON user_malls(corp_id, mall_key, use_yn)`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_user_malls_mock_corp
    ON user_malls(corp_id, mall_key)
    WHERE mall_key = 'MOCK_MALL'
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.hub_job') IS NOT NULL THEN
        ALTER TABLE hub_job
        ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

        ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS parent_job_id VARCHAR(100);
        ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(100);
        ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS causation_id VARCHAR(100);
        ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS schema_version VARCHAR(20);
        ALTER TABLE hub_job ADD COLUMN IF NOT EXISTS payload_version VARCHAR(20);

        UPDATE hub_job
        SET correlation_id = COALESCE(correlation_id, request_id),
            schema_version = COALESCE(schema_version, '1.0'),
            payload_version = COALESCE(payload_version, '1.0')
        WHERE correlation_id IS NULL
           OR schema_version IS NULL
           OR payload_version IS NULL;

        ALTER TABLE hub_job ALTER COLUMN correlation_id SET NOT NULL;
        ALTER TABLE hub_job ALTER COLUMN schema_version SET NOT NULL;
        ALTER TABLE hub_job ALTER COLUMN payload_version SET NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_hub_job_next_retry_at
        ON hub_job (status, next_retry_at)
        WHERE status = 'QUEUED';

        CREATE INDEX IF NOT EXISTS idx_hub_job_parent_job_id ON hub_job(parent_job_id);
        CREATE INDEX IF NOT EXISTS idx_hub_job_correlation_id ON hub_job(correlation_id);
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_job_result (
      id SERIAL PRIMARY KEY,
      request_id VARCHAR(36) NOT NULL,
      request_key VARCHAR(200),
      job_type VARCHAR(100) NOT NULL,
      source_erp VARCHAR(100) NOT NULL,
      result_payload JSONB NOT NULL,
      saved_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_job_result_request_id
    ON hub_job_result (request_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_job_result_request_key
    ON hub_job_result (request_key)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_job_outbox (
      id BIGSERIAL PRIMARY KEY,
      request_id VARCHAR(100) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      topic VARCHAR(120) NOT NULL,
      partition_key VARCHAR(200) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      retry_count INT NOT NULL DEFAULT 0,
      max_retry_count INT NOT NULL DEFAULT 5,
      next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_by VARCHAR(120),
      locked_at TIMESTAMPTZ,
      last_error TEXT,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_job_outbox_status_retry
    ON hub_job_outbox (status, next_retry_at)
  `);
  // 기존 테이블에 컬럼이 없을 경우 안전하게 추가
  await pool.query(`
    ALTER TABLE hub_job_result
    ADD COLUMN IF NOT EXISTS request_key VARCHAR(200)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_collected_order (
      id BIGSERIAL PRIMARY KEY,
      corp_id BIGINT NOT NULL REFERENCES hub_corp(id),
      channel_account_id BIGINT NOT NULL REFERENCES user_malls(id),
      user_id BIGINT NOT NULL REFERENCES users(id),
      request_id VARCHAR(36),
      request_key VARCHAR(200),
      source_erp VARCHAR(50) NOT NULL DEFAULT 'HUB',
      channel_cd VARCHAR(30) NOT NULL,
      mall_key VARCHAR(50),
      channel_order_id VARCHAR(120) NOT NULL,
      order_status VARCHAR(80),
      claim_status VARCHAR(80),
      claim_type VARCHAR(80),
      order_date TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      buyer_name VARCHAR(200),
      buyer_tel VARCHAR(100),
      buyer_email VARCHAR(300),
      payment_method VARCHAR(80),
      currency_code VARCHAR(10) NOT NULL DEFAULT 'KRW',
      order_amount NUMERIC(18, 2),
      product_amount NUMERIC(18, 2),
      delivery_fee NUMERIC(18, 2),
      discount_amount NUMERIC(18, 2),
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE hub_collected_order
    ADD COLUMN IF NOT EXISTS user_id BIGINT
  `);
  await pool.query(`
    ALTER TABLE hub_collected_order ADD COLUMN IF NOT EXISTS corp_id BIGINT;
    ALTER TABLE hub_collected_order ADD COLUMN IF NOT EXISTS channel_account_id BIGINT
  `);
  await pool.query(`
    INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
    SELECT DISTINCT u.corp_id, o.user_id, o.mall_key, o.mall_key || '-legacy', 'Y'
    FROM hub_collected_order o
    JOIN users u ON u.id = o.user_id
    WHERE o.channel_account_id IS NULL
      AND o.mall_key IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_malls m
        WHERE m.user_id = o.user_id AND m.mall_key = o.mall_key
      )
  `);
  await pool.query(`
    UPDATE hub_collected_order o
    SET corp_id = u.corp_id,
        channel_account_id = (
          SELECT m.id FROM user_malls m
          WHERE m.user_id = o.user_id AND m.mall_key = o.mall_key
          ORDER BY m.id LIMIT 1
        )
    FROM users u
    WHERE o.user_id = u.id
      AND (o.corp_id IS NULL OR o.channel_account_id IS NULL)
  `);
  await pool.query(`ALTER TABLE hub_collected_order ALTER COLUMN corp_id SET NOT NULL`);
  await pool.query(`ALTER TABLE hub_collected_order ALTER COLUMN channel_account_id SET NOT NULL`);
  await pool.query(`DROP INDEX IF EXISTS uidx_hub_collected_order_channel_order`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_account_order
    ON hub_collected_order(channel_account_id, channel_order_id)
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hub_collected_order_corp_date ON hub_collected_order(corp_id, order_date DESC)`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_collected_order_user_date
    ON hub_collected_order(user_id, order_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_collected_order_channel_date
    ON hub_collected_order(channel_cd, order_date DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_collected_order_request
    ON hub_collected_order(request_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_collected_order_item (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES hub_collected_order(id) ON DELETE CASCADE,
      channel_order_item_id VARCHAR(160) NOT NULL,
      product_id VARCHAR(120),
      seller_product_code VARCHAR(160),
      sku_code VARCHAR(160),
      product_name VARCHAR(500),
      option_name VARCHAR(500),
      item_status VARCHAR(80),
      quantity INTEGER,
      unit_price NUMERIC(18, 2),
      item_amount NUMERIC(18, 2),
      discount_amount NUMERIC(18, 2),
      expected_settlement_amount NUMERIC(18, 2),
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_hub_collected_order_item_channel_item
    ON hub_collected_order_item(order_id, channel_order_item_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_collected_order_delivery (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL UNIQUE REFERENCES hub_collected_order(id) ON DELETE CASCADE,
      receiver_name VARCHAR(200),
      receiver_tel VARCHAR(100),
      receiver_zip_code VARCHAR(30),
      receiver_addr1 VARCHAR(500),
      receiver_addr2 VARCHAR(500),
      delivery_memo VARCHAR(1000),
      delivery_company VARCHAR(100),
      tracking_number VARCHAR(100),
      delivery_status VARCHAR(80),
      shipping_due_at TIMESTAMPTZ,
      shipped_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_order_normalize_checkpoint (
      request_id VARCHAR(36) PRIMARY KEY,
      status VARCHAR(20) NOT NULL,
      normalized_count INT NOT NULL DEFAULT 0,
      error_message TEXT,
      normalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_erp_apply_result (
      id BIGSERIAL PRIMARY KEY,
      request_id VARCHAR(100) NOT NULL,
      correlation_id VARCHAR(100) NOT NULL,
      normalized_order_id BIGINT NOT NULL REFERENCES hub_collected_order(id),
      erp_connection_id VARCHAR(100) NOT NULL,
      operation VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      erp_document_no VARCHAR(120),
      request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code VARCHAR(100),
      error_message TEXT,
      attempt_count INT NOT NULL DEFAULT 0,
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (idempotency_key, normalized_order_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_request ON hub_erp_apply_result(request_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_hub_erp_apply_result_status ON hub_erp_apply_result(status, updated_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_worker_heartbeat (
      worker_id VARCHAR(100) PRIMARY KEY,
      role VARCHAR(30) NOT NULL,
      pid INT NOT NULL,
      hostname VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      heartbeat_interval_seconds INT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_worker_heartbeat_role
    ON hub_worker_heartbeat (role, last_seen_at)
  `);
  await pool.query(`
    DELETE FROM hub_worker_heartbeat
    WHERE status <> 'ONLINE'
       OR last_seen_at < NOW() - INTERVAL '2 minutes'
  `);
}

export async function saveWorkerHeartbeat(input: {
  workerId: string;
  role: string;
  pid: number;
  hostname: string;
  status: "ONLINE" | "STOPPED";
  startedAt: Date;
  heartbeatIntervalSeconds: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO hub_worker_heartbeat (
        worker_id,
        role,
        pid,
        hostname,
        status,
        started_at,
        last_seen_at,
        heartbeat_interval_seconds,
        metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), $7, $8::jsonb
      )
      ON CONFLICT (worker_id)
      DO UPDATE
      SET role = EXCLUDED.role,
          pid = EXCLUDED.pid,
          hostname = EXCLUDED.hostname,
          status = EXCLUDED.status,
          last_seen_at = NOW(),
          heartbeat_interval_seconds = EXCLUDED.heartbeat_interval_seconds,
          metadata = EXCLUDED.metadata
    `,
    [
      input.workerId,
      input.role,
      input.pid,
      input.hostname,
      input.status,
      input.startedAt,
      input.heartbeatIntervalSeconds,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function tryMarkProcessing(requestId: string): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'PROCESSING',
          error_message = NULL,
          next_retry_at = NULL,
          updated_at = NOW()
      WHERE request_id = $1
        AND status = 'QUEUED'
    `,
    [requestId]
  );

  const updated = result.rowCount === 1;
  logger.info({
    event: updated ? "JOB_STATUS_PROCESSING" : "JOB_STATUS_PROCESSING_SKIPPED",
    requestId,
    fromStatus: "QUEUED",
    toStatus: "PROCESSING",
    rowCount: result.rowCount
  }, updated ? "Job marked as processing" : "Job was not marked as processing");

  await saveJobLog({
    requestId,
    eventType: updated ? "JOB_STATUS_PROCESSING" : "JOB_STATUS_PROCESSING_SKIPPED",
    level: "INFO",
    message: updated ? "Job marked as processing" : "Job was not marked as processing",
    detail: {
      fromStatus: "QUEUED",
      toStatus: "PROCESSING",
      rowCount: result.rowCount
    }
  });

  return updated;
}

export async function saveJobResult(
  message: HubJobMessage,
  resultPayload: Record<string, unknown>
): Promise<SaveJobResultStatus> {
  const capture = jobResultCapture.getStore();
  if (capture?.requestId === message.requestId) {
    capture.resultPayload = resultPayload;
    return "INSERTED";
  }

  const result = await pool.query(
    `
      INSERT INTO hub_job_result (
        request_id,
        request_key,
        job_type,
        source_erp,
        result_payload,
        saved_at
      )
      SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::jsonb, NOW()
      WHERE EXISTS (
        SELECT 1
        FROM hub_job
        WHERE request_id = $1::varchar
          AND status = 'PROCESSING'
      )
      ON CONFLICT (request_id) DO NOTHING
    `,
    [
      message.requestId,
      message.requestKey ?? null,
      message.jobType,
      message.sourceErp,
      JSON.stringify(resultPayload)
    ]
  );
  const saveStatus: SaveJobResultStatus = result.rowCount === 1 ? "INSERTED" : "SKIPPED";

  logger.info({
    event: saveStatus === "INSERTED" ? "JOB_RESULT_SAVE_SUCCESS" : "JOB_RESULT_SAVE_SKIPPED",
    requestId: message.requestId,
    requestKey: message.requestKey,
    jobType: message.jobType,
    sourceErp: message.sourceErp,
    rowCount: result.rowCount
  }, saveStatus === "INSERTED" ? "Job result saved" : "Job result save skipped");

  await saveJobLog({
    requestId: message.requestId,
    eventType: saveStatus === "INSERTED" ? "JOB_RESULT_SAVE_SUCCESS" : "JOB_RESULT_SAVE_SKIPPED",
    level: "INFO",
    message: saveStatus === "INSERTED" ? "Job result saved" : "Job result save skipped",
    jobType: message.jobType,
    sourceErp: message.sourceErp,
    requestKey: message.requestKey,
    detail: {
      rowCount: result.rowCount
    }
  });

  return saveStatus;
}

export async function captureOrderCollectResult(
  message: HubJobMessage,
  work: () => Promise<void>
): Promise<Record<string, unknown>> {
  const capture: CapturedJobResult = { requestId: message.requestId };
  await jobResultCapture.run(capture, work);
  if (!capture.resultPayload) {
    throw new Error(`ORDER_COLLECT handler did not provide a job result: ${message.requestId}`);
  }
  return capture.resultPayload;
}

export async function completeOrderCollectWithNormalize(
  message: HubJobMessage,
  resultPayload: Record<string, unknown>
): Promise<CompleteOrderCollectResult> {
  if (message.jobType !== "ORDER_COLLECT") {
    throw new Error(`Expected ORDER_COLLECT but received ${message.jobType}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentResult = await client.query<{
      request_id: string;
      request_key: string;
      source_erp: string;
      correlation_id: string;
    }>(
      `
        SELECT request_id, request_key, source_erp, correlation_id
        FROM hub_job
        WHERE request_id = $1
          AND status = 'PROCESSING'
        FOR UPDATE
      `,
      [message.requestId]
    );
    const parent = parentResult.rows[0];
    if (!parent) {
      await client.query("ROLLBACK");
      return { succeeded: false, normalizeJob: null, outboxCreated: false };
    }

    await client.query(
      `
        INSERT INTO hub_job_result (
          request_id, request_key, job_type, source_erp, result_payload, saved_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        ON CONFLICT (request_id) DO UPDATE
        SET request_key = EXCLUDED.request_key,
            job_type = EXCLUDED.job_type,
            source_erp = EXCLUDED.source_erp,
            result_payload = EXCLUDED.result_payload,
            saved_at = NOW()
      `,
      [message.requestId, parent.request_key, message.jobType, parent.source_erp, JSON.stringify(resultPayload)]
    );

    const normalizeJob = await createNormalizeChild(client, message, parent, resultPayload);
    let outboxCreated = false;
    if (normalizeJob) {
      const outboxPayload = {
        requestId: normalizeJob.requestId,
        requestKey: normalizeJob.requestKey,
        jobType: normalizeJob.jobType,
        status: "QUEUED",
        sourceErp: normalizeJob.sourceErp,
        channelCd: String(normalizeJob.payload.channelCd ?? "ORDER"),
        parentJobId: normalizeJob.parentJobId,
        correlationId: normalizeJob.correlationId,
        causationId: normalizeJob.causationId,
        schemaVersion: normalizeJob.schemaVersion,
        payloadVersion: normalizeJob.payloadVersion,
        payload: normalizeJob.payload
      };
      const outboxResult = await client.query(
        `
          INSERT INTO hub_job_outbox (
            request_id, event_type, topic, partition_key, payload, status,
            retry_count, max_retry_count, next_retry_at, created_at, updated_at
          )
          SELECT $1::varchar, 'ORDER_NORMALIZE', $2::varchar, $3::varchar, $4::jsonb, 'PENDING', 0, 5, NOW(), NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM hub_job_outbox
            WHERE request_id = $1::varchar AND event_type = 'ORDER_NORMALIZE'
          )
        `,
        [
          normalizeJob.requestId,
          process.env.KAFKA_TOPIC ?? "hub.jobs",
          resolveJobPartitionKey(normalizeJob),
          JSON.stringify(outboxPayload)
        ]
      );
      outboxCreated = outboxResult.rowCount === 1;
    }

    const successResult = await client.query(
      `
        UPDATE hub_job
        SET status = 'SUCCESS', error_message = NULL, next_retry_at = NULL,
            completed_at = NOW(), updated_at = NOW()
        WHERE request_id = $1 AND status = 'PROCESSING'
      `,
      [message.requestId]
    );
    if (successResult.rowCount !== 1) {
      throw new Error(`ORDER_COLLECT success transition failed: ${message.requestId}`);
    }

    await client.query("COMMIT");
    return { succeeded: true, normalizeJob, outboxCreated };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function completeOrderNormalizeWithErpApply(
  message: HubJobMessage
): Promise<CompleteOrderNormalizeResult> {
  if (message.jobType !== "ORDER_NORMALIZE") {
    throw new Error(`Expected ORDER_NORMALIZE but received ${message.jobType}`);
  }
  const sourceRequestId = requiredPayloadString(message.payload, "sourceRequestId");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentResult = await client.query<{
      request_id: string;
      request_key: string;
      correlation_id: string;
    }>(
      `
        SELECT request_id, request_key, correlation_id
        FROM hub_job
        WHERE request_id = $1 AND status = 'PROCESSING'
        FOR UPDATE
      `,
      [message.requestId]
    );
    const parent = parentResult.rows[0];
    if (!parent) {
      await client.query("ROLLBACK");
      return { succeeded: false, erpApplyJob: null, outboxCreated: false };
    }

    const normalized = await client.query<{
      id: number; corp_id: number; user_id: number; channel_account_id: number; channel_cd: string;
    }>(
      `
        SELECT id, corp_id, user_id, channel_account_id, channel_cd
        FROM hub_collected_order WHERE request_id = $1 ORDER BY id
      `,
      [sourceRequestId]
    );
    const normalizedOrderIds = normalized.rows.map((row) => Number(row.id));
    let erpApplyJob: NormalizeJobInput | null = null;
    let outboxCreated = false;

    if (normalizedOrderIds.length > 0) {
      const identity = normalized.rows[0];
      const corpId = optionalPayloadInteger(message.payload, "corpId") ?? Number(identity.corp_id);
      const userId = optionalPayloadInteger(message.payload, "userId") ?? Number(identity.user_id);
      const channelAccountId = optionalPayloadInteger(message.payload, "channelAccountId") ?? Number(identity.channel_account_id);
      const channelCd = optionalPayloadString(message.payload, "channelCd") ?? identity.channel_cd;
      const erpConnectionId = `MOCK-${corpId}`;
      const idempotencyKey = createHash("sha256")
        .update(`${erpConnectionId}:CREATE:${normalizedOrderIds.join(",")}`)
        .digest("hex");
      const payload = {
        sourceNormalizeJobId: message.requestId,
        normalizedOrderIds,
        corpId,
        userId,
        channelAccountId,
        channelCd,
        erpConnectionId,
        operation: "CREATE",
        idempotencyKey
      };
      const requestKey = `ERP_APPLY_${message.requestId}`;
      await client.query(
        `
          INSERT INTO hub_job (
            request_id, request_key, channel_cd, status, payload, retry_count,
            job_type, source_erp, parent_job_id, correlation_id, causation_id,
            schema_version, payload_version, created_at, updated_at
          ) VALUES (
            $1, $2, $3, 'QUEUED', $4::jsonb, 0, 'ERP_APPLY', 'HUB',
            $5, $6, $5, '1.0', '1.0', NOW(), NOW()
          )
          ON CONFLICT (request_key) DO NOTHING
        `,
        [randomUUID(), requestKey, channelCd, JSON.stringify(payload), message.requestId, parent.correlation_id]
      );
      const child = await client.query<{
        request_id: string; request_key: string; source_erp: string; job_type: string;
        parent_job_id: string | null; correlation_id: string; causation_id: string | null;
        schema_version: string; payload_version: string; payload: Record<string, unknown>;
      }>(
        `
          SELECT request_id, request_key, source_erp, job_type, parent_job_id,
                 correlation_id, causation_id, schema_version, payload_version, payload
          FROM hub_job WHERE request_key = $1
        `,
        [requestKey]
      );
      const row = child.rows[0];
      if (!row || row.parent_job_id !== message.requestId || row.correlation_id !== parent.correlation_id) {
        throw new Error(`ERP_APPLY child relationship mismatch: ${requestKey}`);
      }
      erpApplyJob = {
        requestId: row.request_id,
        requestKey: row.request_key,
        sourceErp: row.source_erp,
        jobType: row.job_type,
        parentJobId: row.parent_job_id,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        schemaVersion: row.schema_version,
        payloadVersion: row.payload_version,
        payload: row.payload
      };
      const outboxPayload = { ...erpApplyJob, status: "QUEUED", channelCd };
      const outboxResult = await client.query(
        `
          INSERT INTO hub_job_outbox (
            request_id, event_type, topic, partition_key, payload, status,
            retry_count, max_retry_count, next_retry_at, created_at, updated_at
          )
          SELECT $1::varchar, 'ERP_APPLY', $2::varchar, $3::varchar, $4::jsonb, 'PENDING', 0, 5, NOW(), NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM hub_job_outbox WHERE request_id = $1::varchar AND event_type = 'ERP_APPLY'
          )
        `,
        [
          erpApplyJob.requestId,
          process.env.KAFKA_TOPIC ?? "hub.jobs",
          resolveJobPartitionKey(erpApplyJob),
          JSON.stringify(outboxPayload)
        ]
      );
      outboxCreated = outboxResult.rowCount === 1;
    }

    const success = await client.query(
      `
        UPDATE hub_job
        SET status = 'SUCCESS', error_message = NULL, next_retry_at = NULL,
            completed_at = NOW(), updated_at = NOW()
        WHERE request_id = $1 AND status = 'PROCESSING'
      `,
      [message.requestId]
    );
    if (success.rowCount !== 1) {
      throw new Error(`ORDER_NORMALIZE success transition failed: ${message.requestId}`);
    }
    await client.query("COMMIT");
    return { succeeded: true, erpApplyJob, outboxCreated };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createNormalizeChild(
  client: pg.PoolClient,
  message: HubJobMessage,
  parent: { request_id: string; request_key: string; source_erp: string; correlation_id: string },
  resultPayload: Record<string, unknown>
): Promise<NormalizeJobInput | null> {
  const orders = Array.isArray(resultPayload.orders) ? resultPayload.orders : [];
  if (orders.length === 0) {
    return null;
  }

  const requestKey = `NORMALIZE_${message.requestId}`;
  const payload = {
    sourceRequestId: message.requestId,
    sourceRequestKey: parent.request_key,
    userId: message.payload?.userId,
    corpId: message.payload?.corpId,
    channelAccountId: message.payload?.channelAccountId,
    channelCd: message.payload?.channelCd ?? resultPayload.channelCd,
    mallKey: message.payload?.mallKey ?? resultPayload.mallKey,
    frDt: message.payload?.frDt ?? resultPayload.frDt,
    toDt: message.payload?.toDt ?? resultPayload.toDt
  };
  await client.query<{ request_id: string }>(
    `
      INSERT INTO hub_job (
        request_id, request_key, channel_cd, status, payload, retry_count,
        job_type, source_erp, parent_job_id, correlation_id, causation_id,
        schema_version, payload_version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'QUEUED', $4::jsonb, 0, 'ORDER_NORMALIZE', 'HUB',
        $5, $6, $5, '1.0', '1.0', NOW(), NOW()
      )
      ON CONFLICT (request_key) DO NOTHING
      RETURNING request_id
    `,
    [randomUUID(), requestKey, String(payload.channelCd ?? "ORDER"), JSON.stringify(payload), message.requestId, parent.correlation_id]
  );

  const child = await client.query<{
    request_id: string; request_key: string; source_erp: string; job_type: string;
    parent_job_id: string | null; correlation_id: string; causation_id: string | null;
    schema_version: string; payload_version: string; payload: Record<string, unknown>;
  }>(
    `
      SELECT request_id, request_key, source_erp, job_type, parent_job_id,
             correlation_id, causation_id, schema_version, payload_version, payload
      FROM hub_job
      WHERE request_key = $1
    `,
    [requestKey]
  );
  const row = child.rows[0];
  if (!row) {
    throw new Error(`ORDER_NORMALIZE child was not found after insert: ${requestKey}`);
  }
  if (row.parent_job_id !== message.requestId || row.correlation_id !== parent.correlation_id) {
    throw new Error(`Existing ORDER_NORMALIZE child relationship mismatch: ${requestKey}`);
  }

  return {
    requestId: row.request_id,
    requestKey: row.request_key,
    sourceErp: row.source_erp,
    jobType: row.job_type,
    parentJobId: row.parent_job_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    schemaVersion: row.schema_version,
    payloadVersion: row.payload_version,
    payload: row.payload
  };
}

export async function findJobResultForNormalize(sourceRequestId: string): Promise<JobResultForNormalize> {
  const result = await pool.query<{
    request_id: string;
    request_key: string;
    source_erp: string;
    result_payload: Record<string, unknown>;
    job_payload: Record<string, unknown>;
  }>(
    `
      SELECT
        r.request_id,
        r.request_key,
        r.source_erp,
        r.result_payload,
        COALESCE(j.payload::jsonb, '{}'::jsonb) AS job_payload
      FROM hub_job_result r
      LEFT JOIN hub_job j ON j.request_id = r.request_id
      WHERE r.request_id = $1
    `,
    [sourceRequestId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Job result not found for normalize: ${sourceRequestId}`);
  }

  return {
    requestId: row.request_id,
    requestKey: row.request_key,
    sourceErp: row.source_erp,
    resultPayload: row.result_payload,
    jobPayload: row.job_payload
  };
}

export async function findNormalizedOrdersForErp(orderIds: number[]): Promise<NormalizedOrderForErp[]> {
  if (orderIds.length === 0) {
    return [];
  }
  const result = await pool.query<{
    id: number;
    channel_order_id: string;
    order_status: string | null;
    order_amount: string | null;
    buyer_name: string | null;
    items: Array<Record<string, unknown>>;
  }>(
    `
      SELECT o.id, o.channel_order_id, o.order_status, o.order_amount::text, o.buyer_name,
             COALESCE(
               jsonb_agg(to_jsonb(i) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),
               '[]'::jsonb
             ) AS items
      FROM hub_collected_order o
      LEFT JOIN hub_collected_order_item i ON i.order_id = o.id
      WHERE o.id = ANY($1::bigint[])
      GROUP BY o.id
      ORDER BY o.id
    `,
    [orderIds]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    channelOrderId: row.channel_order_id,
    orderStatus: row.order_status,
    orderAmount: row.order_amount,
    buyerName: row.buyer_name,
    items: row.items
  }));
}

export async function areErpOrdersAlreadyApplied(
  idempotencyKey: string,
  normalizedOrderIds: number[]
): Promise<boolean> {
  if (normalizedOrderIds.length === 0) {
    return true;
  }
  const result = await pool.query<{ applied_count: number }>(
    `
      SELECT COUNT(*)::int AS applied_count
      FROM hub_erp_apply_result
      WHERE idempotency_key = $1
        AND normalized_order_id = ANY($2::bigint[])
        AND status = 'APPLIED'
    `,
    [idempotencyKey, normalizedOrderIds]
  );
  return Number(result.rows[0]?.applied_count ?? 0) === normalizedOrderIds.length;
}

export async function saveErpApplyResults(input: {
  requestId: string;
  correlationId: string;
  normalizedOrderIds: number[];
  erpConnectionId: string;
  operation: string;
  status: "APPLIED" | "FAILED";
  idempotencyKey: string;
  erpDocumentNo?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const normalizedOrderId of input.normalizedOrderIds) {
      await client.query(
        `
          INSERT INTO hub_erp_apply_result (
            request_id, correlation_id, normalized_order_id, erp_connection_id,
            operation, status, idempotency_key, erp_document_no,
            request_payload, response_payload, error_code, error_message,
            attempt_count, applied_at, created_at, updated_at
          ) VALUES (
            $1::varchar, $2::varchar, $3::bigint, $4::varchar,
            $5::varchar, $6::varchar, $7::varchar, $8::varchar,
            $9::jsonb, $10::jsonb, $11, $12, 1,
            CASE WHEN $6::varchar = 'APPLIED' THEN NOW() ELSE NULL END, NOW(), NOW()
          )
          ON CONFLICT (idempotency_key, normalized_order_id) DO UPDATE
          SET request_id = EXCLUDED.request_id,
              correlation_id = EXCLUDED.correlation_id,
              status = EXCLUDED.status,
              erp_document_no = EXCLUDED.erp_document_no,
              request_payload = EXCLUDED.request_payload,
              response_payload = EXCLUDED.response_payload,
              error_code = EXCLUDED.error_code,
              error_message = EXCLUDED.error_message,
              attempt_count = hub_erp_apply_result.attempt_count + 1,
              applied_at = CASE
                WHEN EXCLUDED.status = 'APPLIED' THEN NOW()
                ELSE hub_erp_apply_result.applied_at
              END,
              updated_at = NOW()
        `,
        [
          input.requestId,
          input.correlationId,
          normalizedOrderId,
          input.erpConnectionId,
          input.operation,
          input.status,
          input.idempotencyKey,
          input.erpDocumentNo ?? null,
          JSON.stringify(input.requestPayload),
          JSON.stringify(input.responsePayload ?? {}),
          input.errorCode ?? null,
          input.errorMessage ?? null
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveNormalizeCheckpoint(input: {
  sourceRequestId: string;
  status: "SUCCESS" | "FAILED";
  normalizedCount: number;
  errorMessage?: string | null;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO hub_order_normalize_checkpoint (
        request_id,
        status,
        normalized_count,
        error_message,
        normalized_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (request_id) DO UPDATE
        SET status = EXCLUDED.status,
            normalized_count = EXCLUDED.normalized_count,
            error_message = EXCLUDED.error_message,
            normalized_at = EXCLUDED.normalized_at,
            updated_at = NOW()
    `,
    [input.sourceRequestId, input.status, input.normalizedCount, input.errorMessage ?? null]
  );
}

export async function upsertNormalizedOrder(input: {
  corpId: number;
  channelAccountId: number;
  userId: number;
  requestId: string;
  requestKey: string;
  sourceErp: string;
  channelCd: string;
  mallKey?: string | null;
  channelOrderId: string;
  orderStatus?: string | null;
  orderDate?: Date | null;
  paidAt?: Date | null;
  buyerName?: string | null;
  buyerTel?: string | null;
  buyerEmail?: string | null;
  paymentMethod?: string | null;
  orderAmount?: number | null;
  productAmount?: number | null;
  deliveryFee?: number | null;
  discountAmount?: number | null;
  rawPayload: Record<string, unknown>;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `
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
        paid_at,
        buyer_name,
        buyer_tel,
        buyer_email,
        payment_method,
        order_amount,
        product_amount,
        delivery_fee,
        discount_amount,
        raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb
      )
      ON CONFLICT (channel_account_id, channel_order_id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            request_id = EXCLUDED.request_id,
            request_key = EXCLUDED.request_key,
            source_erp = EXCLUDED.source_erp,
            mall_key = EXCLUDED.mall_key,
            order_status = EXCLUDED.order_status,
            order_date = EXCLUDED.order_date,
            paid_at = EXCLUDED.paid_at,
            buyer_name = EXCLUDED.buyer_name,
            buyer_tel = EXCLUDED.buyer_tel,
            buyer_email = EXCLUDED.buyer_email,
            payment_method = EXCLUDED.payment_method,
            order_amount = EXCLUDED.order_amount,
            product_amount = EXCLUDED.product_amount,
            delivery_fee = EXCLUDED.delivery_fee,
            discount_amount = EXCLUDED.discount_amount,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
      RETURNING id
    `,
    [
      input.corpId,
      input.channelAccountId,
      input.userId,
      input.requestId,
      input.requestKey,
      input.sourceErp,
      input.channelCd,
      input.mallKey ?? null,
      input.channelOrderId,
      input.orderStatus ?? null,
      input.orderDate ?? null,
      input.paidAt ?? null,
      input.buyerName ?? null,
      input.buyerTel ?? null,
      input.buyerEmail ?? null,
      input.paymentMethod ?? null,
      input.orderAmount ?? null,
      input.productAmount ?? null,
      input.deliveryFee ?? null,
      input.discountAmount ?? null,
      JSON.stringify(input.rawPayload)
    ]
  );

  return result.rows[0].id;
}

export async function upsertNormalizedOrderItem(input: {
  orderId: number;
  channelOrderItemId: string;
  productId?: string | null;
  sellerProductCode?: string | null;
  skuCode?: string | null;
  productName?: string | null;
  optionName?: string | null;
  itemStatus?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  itemAmount?: number | null;
  discountAmount?: number | null;
  expectedSettlementAmount?: number | null;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO hub_collected_order_item (
        order_id,
        channel_order_item_id,
        product_id,
        seller_product_code,
        sku_code,
        product_name,
        option_name,
        item_status,
        quantity,
        unit_price,
        item_amount,
        discount_amount,
        expected_settlement_amount,
        raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      ON CONFLICT (order_id, channel_order_item_id) DO UPDATE
        SET product_id = EXCLUDED.product_id,
            seller_product_code = EXCLUDED.seller_product_code,
            sku_code = EXCLUDED.sku_code,
            product_name = EXCLUDED.product_name,
            option_name = EXCLUDED.option_name,
            item_status = EXCLUDED.item_status,
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            item_amount = EXCLUDED.item_amount,
            discount_amount = EXCLUDED.discount_amount,
            expected_settlement_amount = EXCLUDED.expected_settlement_amount,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
    `,
    [
      input.orderId,
      input.channelOrderItemId,
      input.productId ?? null,
      input.sellerProductCode ?? null,
      input.skuCode ?? null,
      input.productName ?? null,
      input.optionName ?? null,
      input.itemStatus ?? null,
      input.quantity ?? null,
      input.unitPrice ?? null,
      input.itemAmount ?? null,
      input.discountAmount ?? null,
      input.expectedSettlementAmount ?? null,
      JSON.stringify(input.rawPayload)
    ]
  );
}

export async function upsertNormalizedDelivery(input: {
  orderId: number;
  receiverName?: string | null;
  receiverTel?: string | null;
  receiverZipCode?: string | null;
  receiverAddr1?: string | null;
  receiverAddr2?: string | null;
  deliveryMemo?: string | null;
  deliveryCompany?: string | null;
  trackingNumber?: string | null;
  deliveryStatus?: string | null;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO hub_collected_order_delivery (
        order_id,
        receiver_name,
        receiver_tel,
        receiver_zip_code,
        receiver_addr1,
        receiver_addr2,
        delivery_memo,
        delivery_company,
        tracking_number,
        delivery_status,
        raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
      )
      ON CONFLICT (order_id) DO UPDATE
        SET receiver_name = EXCLUDED.receiver_name,
            receiver_tel = EXCLUDED.receiver_tel,
            receiver_zip_code = EXCLUDED.receiver_zip_code,
            receiver_addr1 = EXCLUDED.receiver_addr1,
            receiver_addr2 = EXCLUDED.receiver_addr2,
            delivery_memo = EXCLUDED.delivery_memo,
            delivery_company = EXCLUDED.delivery_company,
            tracking_number = EXCLUDED.tracking_number,
            delivery_status = EXCLUDED.delivery_status,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = NOW()
    `,
    [
      input.orderId,
      input.receiverName ?? null,
      input.receiverTel ?? null,
      input.receiverZipCode ?? null,
      input.receiverAddr1 ?? null,
      input.receiverAddr2 ?? null,
      input.deliveryMemo ?? null,
      input.deliveryCompany ?? null,
      input.trackingNumber ?? null,
      input.deliveryStatus ?? null,
      JSON.stringify(input.rawPayload)
    ]
  );
}

export async function saveJobLog(input: {
  requestId: string;
  eventType: string;
  level: JobLogLevel;
  message: string;
  jobType?: string | null;
  sourceErp?: string | null;
  requestKey?: string | null;
  channelCd?: string | null;
  mallKey?: string | null;
  retryCount?: number | null;
  maxRetryCount?: number | null;
  errorMessage?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await pool.query(
      `
        INSERT INTO hub_job_log (
          request_id,
          event_type,
          level,
          message,
          job_type,
          source_erp,
          request_key,
          channel_cd,
          mall_key,
          retry_count,
          max_retry_count,
          error_message,
          detail
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
        )
      `,
      [
        input.requestId,
        input.eventType,
        input.level,
        input.message,
        input.jobType ?? null,
        input.sourceErp ?? null,
        input.requestKey ?? null,
        input.channelCd ?? null,
        input.mallKey ?? null,
        input.retryCount ?? null,
        input.maxRetryCount ?? null,
        input.errorMessage ?? null,
        JSON.stringify(input.detail ?? {})
      ]
    );
  } catch (error) {
    logger.warn({
      event: "JOB_LOG_SAVE_FAILED",
      err: error,
      requestId: input.requestId,
      eventType: input.eventType
    }, "Job log save failed");
  }
}

export async function saveNews(items: NewsItemInput[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const result = await pool.query(
      `
        INSERT INTO hub_news (
          source,
          category,
          title,
          summary,
          url,
          corp_name,
          content_hash,
          published_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (content_hash) DO NOTHING
      `,
      [
        item.source,
        item.category ?? null,
        item.title,
        item.summary ?? null,
        item.url ?? null,
        item.corpName ?? null,
        item.contentHash,
        item.publishedAt
      ]
    );

    if (result.rowCount === 1) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return { inserted, skipped };
}

export async function findActiveChannelCredentials(
  corpId: number,
  channelAccountId: number
): Promise<Record<string, string | null>> {
  const result = await pool.query<{
    key: string | null;
    key2: string | null;
    auth_key: string | null;
    mall_id: string | null;
    mall_pw: string | null;
    vendor_id: string | null;
  }>(
    `
      SELECT key, key2, auth_key, mall_id, mall_pw, vendor_id
      FROM user_malls
      WHERE corp_id = $1
        AND id = $2
        AND use_yn = 'Y'
    `,
    [corpId, channelAccountId]
  );

  const row = result.rows[0];
  if (!row) {
    logger.warn({
      event: "CHANNEL_CREDENTIAL_NOT_FOUND",
      corpId,
      channelAccountId
    }, "Active channel credential not found");
    throw new Error(`Active channel credential not found: corpId=${corpId}, channelAccountId=${channelAccountId}`);
  }

  return {
    key: decryptAes(row.key),
    key2: decryptAes(row.key2),
    authKey: decryptAes(row.auth_key),
    mallId: decryptAes(row.mall_id),
    mallPw: decryptAes(row.mall_pw),
    vendorId: decryptAes(row.vendor_id)
  };
}

export async function findActiveChannelAccountIdentity(
  userId: number,
  mallKey: string
): Promise<{ corpId: number; channelAccountId: number }> {
  const result = await pool.query<{ corp_id: string; id: string }>(
    `
      SELECT m.corp_id, m.id
      FROM user_malls m
      JOIN users u ON u.corp_id = m.corp_id
      WHERE u.id = $1
        AND m.mall_key = $2
        AND m.use_yn = 'Y'
      ORDER BY m.id
      LIMIT 1
    `,
    [userId, mallKey]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Active channel account not found: userId=${userId}, mallKey=${mallKey}`);
  }
  return {
    corpId: Number(row.corp_id),
    channelAccountId: Number(row.id)
  };
}

export async function tryAcquireJobLock(
  lockKey: string,
  requestId: string
): Promise<boolean> {
  const result = await pool.query<{ lock_key: string }>(
    `
      INSERT INTO hub_job_lock (
        lock_key,
        request_id,
        locked_by,
        locked_at,
        expires_at
      ) VALUES (
        $1,
        $2,
        $3,
        NOW(),
        NOW() + ($4::int * INTERVAL '1 minute')
      )
      ON CONFLICT (lock_key)
      DO UPDATE
      SET request_id = EXCLUDED.request_id,
          locked_by = EXCLUDED.locked_by,
          locked_at = NOW(),
          expires_at = EXCLUDED.expires_at
      WHERE hub_job_lock.expires_at < NOW()
      RETURNING lock_key
    `,
    [lockKey, requestId, WORKER_ID, LOCK_TTL_MINUTES]
  );

  const acquired = result.rowCount === 1;
  logger.info({
    event: acquired ? "JOB_LOCK_ACQUIRED" : "JOB_LOCK_CONFLICT",
    requestId,
    lockKey,
    lockedBy: WORKER_ID,
    ttlMinutes: LOCK_TTL_MINUTES
  }, acquired ? "Job lock acquired" : "Job lock conflict");

  await saveJobLog({
    requestId,
    eventType: acquired ? "JOB_LOCK_ACQUIRED" : "JOB_LOCK_CONFLICT",
    level: acquired ? "INFO" : "WARN",
    message: acquired ? "Job lock acquired" : "Same channel account is already collecting",
    detail: {
      lockKey,
      lockedBy: WORKER_ID,
      ttlMinutes: LOCK_TTL_MINUTES
    }
  });

  return acquired;
}

export async function releaseJobLock(
  lockKey: string,
  requestId: string
): Promise<void> {
  try {
    const result = await pool.query(
      `
        DELETE FROM hub_job_lock
        WHERE lock_key = $1
          AND request_id = $2
      `,
      [lockKey, requestId]
    );

    logger.info({
      event: result.rowCount === 1 ? "JOB_LOCK_RELEASED" : "JOB_LOCK_RELEASE_SKIPPED",
      requestId,
      lockKey,
      lockedBy: WORKER_ID,
      rowCount: result.rowCount
    }, result.rowCount === 1 ? "Job lock released" : "Job lock release skipped");

    await saveJobLog({
      requestId,
      eventType: result.rowCount === 1 ? "JOB_LOCK_RELEASED" : "JOB_LOCK_RELEASE_SKIPPED",
      level: "INFO",
      message: result.rowCount === 1 ? "Job lock released" : "Job lock release skipped",
      detail: {
        lockKey,
        lockedBy: WORKER_ID,
        rowCount: result.rowCount
      }
    });
  } catch (error) {
    logger.error({
      event: "JOB_LOCK_RELEASE_FAILED",
      err: error,
      requestId,
      lockKey,
      lockedBy: WORKER_ID
    }, "Job lock release failed");

    await saveJobLog({
      requestId,
      eventType: "JOB_LOCK_RELEASE_FAILED",
      level: "ERROR",
      message: "Job lock release failed",
      detail: {
        lockKey,
        lockedBy: WORKER_ID
      }
    });
  }
}

export async function deferJobForLockConflict(
  requestId: string,
  lockKey: string
): Promise<boolean> {
  const message = "Same channel account is already collecting";
  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'QUEUED',
          error_message = $2,
          next_retry_at = NULL,
          updated_at = NOW()
      WHERE request_id = $1
        AND status = 'PROCESSING'
    `,
    [requestId, message]
  );

  const deferred = result.rowCount === 1;
  logger.warn({
    event: deferred ? "JOB_LOCK_CONFLICT_DEFERRED" : "JOB_LOCK_CONFLICT_DEFER_SKIPPED",
    requestId,
    lockKey,
    rowCount: result.rowCount
  }, deferred ? "Job deferred because lock is held" : "Job defer skipped after lock conflict");

  await saveJobLog({
    requestId,
    eventType: deferred ? "JOB_LOCK_CONFLICT_DEFERRED" : "JOB_LOCK_CONFLICT_DEFER_SKIPPED",
    level: "WARN",
    message: deferred ? "Job deferred because same channel account is collecting" : "Job defer skipped after lock conflict",
    errorMessage: message,
    detail: {
      lockKey,
      rowCount: result.rowCount
    }
  });

  return deferred;
}

function decryptAes(cipherText: string | null): string | null {
  if (!cipherText) {
    return null;
  }
  if (Buffer.byteLength(AES_SECRET, "utf8") !== 32) {
    throw new Error("HUB_AES_SECRET must be exactly 32 bytes");
  }

  const combined = Buffer.from(cipherText, "base64");
  const iv = combined.subarray(0, 16);
  const encrypted = combined.subarray(16);
  try {
    const decipher = createDecipheriv("aes-256-cbc", Buffer.from(AES_SECRET, "utf8"), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    logger.error({
      event: "CHANNEL_CREDENTIAL_DECRYPT_FAILED",
      err: error
    }, "Channel credential decrypt failed");
    throw error;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseRetryBackoffMs(): number[] {
  const raw = process.env.JOB_RETRY_BACKOFF_MS;
  if (!raw) {
    return DEFAULT_RETRY_BACKOFF_MS;
  }

  const parsed = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));

  return parsed.length > 0 ? parsed : DEFAULT_RETRY_BACKOFF_MS;
}

function getBackoffMs(retryCount: number): number {
  const index = Math.max(0, retryCount - 1);
  return RETRY_BACKOFF_MS[Math.min(index, RETRY_BACKOFF_MS.length - 1)] ?? DEFAULT_RETRY_BACKOFF_MS[0];
}

function requiredPayloadString(payload: Record<string, unknown> | undefined, field: string): string {
  const value = payload?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalPayloadInteger(payload: Record<string, unknown> | undefined, field: string): number | null {
  const value = payload?.[field];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalPayloadString(payload: Record<string, unknown> | undefined, field: string): string | null {
  const value = payload?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function succeedJob(requestId: string): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'SUCCESS',
          error_message = NULL,
          next_retry_at = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE request_id = $1
        AND status = 'PROCESSING'
    `,
    [requestId]
  );
  const updated = result.rowCount === 1;

  logger.info({
    event: updated ? "JOB_STATUS_SUCCESS" : "JOB_STATUS_SUCCESS_SKIPPED",
    requestId,
    fromStatus: "PROCESSING",
    toStatus: "SUCCESS",
    rowCount: result.rowCount
  }, updated ? "Job marked as success" : "Job success update skipped");

  await saveJobLog({
    requestId,
    eventType: updated ? "JOB_STATUS_SUCCESS" : "JOB_STATUS_SUCCESS_SKIPPED",
    level: "INFO",
    message: updated ? "Job marked as success" : "Job success update skipped",
    detail: {
      fromStatus: "PROCESSING",
      toStatus: "SUCCESS",
      rowCount: result.rowCount,
      workerInstanceId: WORKER_ID
    }
  });

  return updated;
}

export async function retryOrFailJob(
  requestId: string,
  errorMessage: string,
  options: {
    retryable?: boolean;
  } = {}
): Promise<RetryDecision> {
  const retryable = options.retryable ?? true;
  const retryResult = await pool.query<{ retry_count: number }>(
    `
      SELECT retry_count
      FROM hub_job
      WHERE request_id = $1
    `,
    [requestId]
  );

  const retryCount = retryResult.rows[0]?.retry_count ?? MAX_RETRY_COUNT;

  if (retryable && retryCount < MAX_RETRY_COUNT) {
    const nextRetryCount = retryCount + 1;
    const backoffMs = getBackoffMs(nextRetryCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    const result = await pool.query(
      `
        UPDATE hub_job
        SET status = 'QUEUED',
            retry_count = retry_count + 1,
            error_message = $2,
            next_retry_at = $3,
            updated_at = NOW()
        WHERE request_id = $1
          AND status = 'PROCESSING'
      `,
      [requestId, errorMessage, nextRetryAt]
    );
    const updated = result.rowCount === 1;

    if (!updated) {
      logger.warn({
        event: "JOB_STATUS_RETRY_SKIPPED",
        requestId,
        fromStatus: "PROCESSING",
        toStatus: "QUEUED",
        retryCount: nextRetryCount,
        maxRetryCount: MAX_RETRY_COUNT,
        nextRetryAt,
        backoffMs,
        errorMessage,
        rowCount: result.rowCount
      }, "Job retry update skipped");

      await saveJobLog({
        requestId,
        eventType: "JOB_STATUS_RETRY_SKIPPED",
        level: "WARN",
        message: "Job retry update skipped",
        retryCount: nextRetryCount,
        maxRetryCount: MAX_RETRY_COUNT,
        errorMessage,
        detail: {
          fromStatus: "PROCESSING",
          toStatus: "QUEUED",
          nextRetryAt: nextRetryAt.toISOString(),
          backoffMs,
          rowCount: result.rowCount,
          workerInstanceId: WORKER_ID
        }
      });

      return {
        status: "SKIPPED",
        retryCount,
        maxRetryCount: MAX_RETRY_COUNT,
        retryable
      };
    }

    logger.warn({
      event: "JOB_STATUS_RETRY",
      requestId,
      fromStatus: "PROCESSING",
      toStatus: "QUEUED",
      retryCount: nextRetryCount,
      maxRetryCount: MAX_RETRY_COUNT,
      nextRetryAt,
      backoffMs,
      errorMessage
    }, "Job marked for retry");

    await saveJobLog({
      requestId,
      eventType: "JOB_STATUS_RETRY",
      level: "WARN",
      message: "Job marked for retry",
      retryCount: nextRetryCount,
      maxRetryCount: MAX_RETRY_COUNT,
      errorMessage,
      detail: {
        fromStatus: "PROCESSING",
        toStatus: "QUEUED",
        nextRetryAt: nextRetryAt.toISOString(),
        backoffMs,
        workerInstanceId: WORKER_ID
      }
    });

    return {
      status: "RETRY",
      retryCount: nextRetryCount,
      maxRetryCount: MAX_RETRY_COUNT,
      nextRetryAt,
      retryable
    };
  }

  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'FAILED',
          error_message = $2,
          next_retry_at = NULL,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE request_id = $1
        AND status = 'PROCESSING'
    `,
    [requestId, errorMessage]
  );
  const updated = result.rowCount === 1;

  logger.error({
    event: updated ? "JOB_STATUS_FAILED" : "JOB_STATUS_FAILED_SKIPPED",
    requestId,
    fromStatus: "PROCESSING",
    toStatus: "FAILED",
    retryCount,
    maxRetryCount: MAX_RETRY_COUNT,
    retryable,
    reason: retryable ? "retry_exhausted" : "non_retryable",
    errorMessage,
    rowCount: result.rowCount
  }, updated ? "Job marked as failed" : "Job failed update skipped");

  await saveJobLog({
    requestId,
    eventType: updated ? "JOB_STATUS_FAILED" : "JOB_STATUS_FAILED_SKIPPED",
    level: "ERROR",
    message: updated ? "Job marked as failed" : "Job failed update skipped",
    retryCount,
    maxRetryCount: MAX_RETRY_COUNT,
    errorMessage,
    detail: {
      fromStatus: "PROCESSING",
      toStatus: "FAILED",
      retryable,
      reason: retryable ? "retry_exhausted" : "non_retryable",
      rowCount: result.rowCount,
      workerInstanceId: WORKER_ID
    }
  });

  if (!updated) {
    return {
      status: "SKIPPED",
      retryCount,
      maxRetryCount: MAX_RETRY_COUNT,
      retryable
    };
  }

  return {
    status: "FAILED",
    retryCount,
    maxRetryCount: MAX_RETRY_COUNT,
    retryable,
    reason: retryable ? "retry_exhausted" : "non_retryable"
  };
}

export async function claimStuckQueuedJobs(): Promise<HubJobRow[]> {
  const result = await pool.query<{
    request_id: string;
    source_erp: string;
    job_type: string;
    request_key: string;
    parent_job_id: string | null;
    correlation_id: string;
    causation_id: string | null;
    schema_version: string;
    payload_version: string;
    payload: Record<string, unknown>;
  }>(
    `
      WITH picked AS (
        SELECT request_id
        FROM hub_job
        WHERE status = 'QUEUED'
          AND (
            (retry_count = 0 AND updated_at < NOW() - INTERVAL '10 minutes')
            OR (retry_count > 0 AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
          )
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 50
      )
      UPDATE hub_job h
      SET status = 'PROCESSING',
          error_message = NULL,
          updated_at = NOW()
      FROM picked
      WHERE h.request_id = picked.request_id
      RETURNING h.request_id, h.source_erp, h.job_type, h.request_key,
                h.parent_job_id, h.correlation_id, h.causation_id,
                h.schema_version, h.payload_version, h.payload
    `
  );

  return result.rows.map((row) => ({
    requestId: row.request_id,
    sourceErp: row.source_erp,
    jobType: row.job_type,
    requestKey: row.request_key,
    parentJobId: row.parent_job_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    schemaVersion: row.schema_version,
    payloadVersion: row.payload_version,
    payload: row.payload
  }));
}

export async function findQueuedNormalizeJobsWithoutOutbox(limit = 20): Promise<Array<{
  requestId: string;
  requestKey: string;
}>> {
  const result = await pool.query<{ request_id: string; request_key: string }>(
    `
      SELECT j.request_id, j.request_key
      FROM hub_job j
      WHERE j.job_type = 'ORDER_NORMALIZE'
        AND j.status = 'QUEUED'
        AND NOT EXISTS (
          SELECT 1
          FROM hub_job_outbox o
          WHERE o.request_id = j.request_id
            AND o.event_type = 'ORDER_NORMALIZE'
        )
      ORDER BY j.created_at ASC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows.map((row) => ({ requestId: row.request_id, requestKey: row.request_key }));
}

export async function claimZombieProcessingJobs(): Promise<HubJobRow[]> {
  const result = await pool.query<{
    request_id: string;
    source_erp: string;
    job_type: string;
    request_key: string;
    parent_job_id: string | null;
    correlation_id: string;
    causation_id: string | null;
    schema_version: string;
    payload_version: string;
    payload: Record<string, unknown>;
  }>(
    `
      WITH picked AS (
        SELECT request_id
        FROM hub_job
        WHERE status = 'PROCESSING'
          AND updated_at < NOW() - INTERVAL '30 minutes'
        ORDER BY updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 20
      )
      UPDATE hub_job h
      SET updated_at = NOW(),
          error_message = COALESCE(error_message, 'Recovered stale PROCESSING job')
      FROM picked
      WHERE h.request_id = picked.request_id
      RETURNING h.request_id, h.source_erp, h.job_type, h.request_key,
                h.parent_job_id, h.correlation_id, h.causation_id,
                h.schema_version, h.payload_version, h.payload
    `
  );

  return result.rows.map((row) => ({
    requestId: row.request_id,
    sourceErp: row.source_erp,
    jobType: row.job_type,
    requestKey: row.request_key,
    parentJobId: row.parent_job_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    schemaVersion: row.schema_version,
    payloadVersion: row.payload_version,
    payload: row.payload
  }));
}

export async function closePostgresPool(): Promise<void> {
  await pool.end();
}
