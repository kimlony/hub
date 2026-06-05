import "dotenv/config";
import { createDecipheriv } from "node:crypto";
import pg from "pg";
import { logger } from "../logger.js";
import { getWorkerId } from "../workerIdentity.js";

type HubJobMessage = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey?: string;
  payload?: Record<string, unknown>;
};

export type HubJobRow = {
  requestId: string;
  sourceErp: string;
  jobType: string;
  requestKey: string;
  payload: Record<string, unknown>;
};

export type RetryDecision = {
  status: "RETRY" | "FAILED" | "SKIPPED";
  retryCount: number;
  maxRetryCount: number;
  nextRetryAt?: Date;
};

export type SaveJobResultStatus = "INSERTED" | "SKIPPED";

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

const MAX_RETRY_COUNT = 3;
const DEFAULT_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
const RETRY_BACKOFF_MS = parseRetryBackoffMs();
const AES_SECRET = requiredEnv("HUB_AES_SECRET");
const LOCK_TTL_MINUTES = Number(process.env.JOB_LOCK_TTL_MINUTES ?? 30);
const WORKER_ID = getWorkerId();
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
    DO $$
    BEGIN
      IF to_regclass('public.hub_job') IS NOT NULL THEN
        ALTER TABLE hub_job
        ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

        CREATE INDEX IF NOT EXISTS idx_hub_job_next_retry_at
        ON hub_job (status, next_retry_at)
        WHERE status = 'QUEUED';
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
  // 기존 테이블에 컬럼이 없을 경우 안전하게 추가
  await pool.query(`
    ALTER TABLE hub_job_result
    ADD COLUMN IF NOT EXISTS request_key VARCHAR(200)
  `);
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
  userId: number,
  mallKey: string
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
      WHERE user_id = $1
        AND mall_key = $2
        AND use_yn = 'Y'
    `,
    [userId, mallKey]
  );

  const row = result.rows[0];
  if (!row) {
    logger.warn({
      event: "CHANNEL_CREDENTIAL_NOT_FOUND",
      userId,
      mallKey
    }, "Active channel credential not found");
    throw new Error(`Active channel credential not found: userId=${userId}, mallKey=${mallKey}`);
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
  errorMessage: string
): Promise<RetryDecision> {
  const retryResult = await pool.query<{ retry_count: number }>(
    `
      SELECT retry_count
      FROM hub_job
      WHERE request_id = $1
    `,
    [requestId]
  );

  const retryCount = retryResult.rows[0]?.retry_count ?? MAX_RETRY_COUNT;

  if (retryCount < MAX_RETRY_COUNT) {
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
        maxRetryCount: MAX_RETRY_COUNT
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
      nextRetryAt
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
      rowCount: result.rowCount,
      workerInstanceId: WORKER_ID
    }
  });

  if (!updated) {
    return {
      status: "SKIPPED",
      retryCount,
      maxRetryCount: MAX_RETRY_COUNT
    };
  }

  return {
    status: "FAILED",
    retryCount,
    maxRetryCount: MAX_RETRY_COUNT
  };
}

export async function claimStuckQueuedJobs(): Promise<HubJobRow[]> {
  const result = await pool.query<{
    request_id: string;
    source_erp: string;
    job_type: string;
    request_key: string;
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
      RETURNING h.request_id, h.source_erp, h.job_type, h.request_key, h.payload
    `
  );

  return result.rows.map((row) => ({
    requestId: row.request_id,
    sourceErp: row.source_erp,
    jobType: row.job_type,
    requestKey: row.request_key,
    payload: row.payload
  }));
}

export async function claimZombieProcessingJobs(): Promise<HubJobRow[]> {
  const result = await pool.query<{
    request_id: string;
    source_erp: string;
    job_type: string;
    request_key: string;
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
      RETURNING h.request_id, h.source_erp, h.job_type, h.request_key, h.payload
    `
  );

  return result.rows.map((row) => ({
    requestId: row.request_id,
    sourceErp: row.source_erp,
    jobType: row.job_type,
    requestKey: row.request_key,
    payload: row.payload
  }));
}

export async function closePostgresPool(): Promise<void> {
  await pool.end();
}
