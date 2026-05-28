import "dotenv/config";
import { createDecipheriv } from "node:crypto";
import pg from "pg";
import { logger } from "../logger.js";

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
};

export type SaveJobResultStatus = "INSERTED" | "SKIPPED";

export type JobLogLevel = "INFO" | "WARN" | "ERROR";

const MAX_RETRY_COUNT = 3;
const AES_SECRET = requiredEnv("HUB_AES_SECRET");
const LOCK_TTL_MINUTES = Number(process.env.JOB_LOCK_TTL_MINUTES ?? 30);
const WORKER_ID = `${process.env.WORKER_ROLE ?? "worker"}:${process.pid}`;

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? "hub_db",
  user: process.env.POSTGRES_USER ?? "hub",
  password: requiredEnv("POSTGRES_PASSWORD"),
  max: 10
});

export async function ensurePostgresSchema(): Promise<void> {
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
}

export async function tryMarkProcessing(requestId: string): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'PROCESSING',
          error_message = NULL,
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

export async function succeedJob(requestId: string): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'SUCCESS',
          error_message = NULL,
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
      rowCount: result.rowCount
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

    const result = await pool.query(
      `
        UPDATE hub_job
        SET status = 'QUEUED',
            retry_count = retry_count + 1,
            error_message = $2,
            updated_at = NOW()
        WHERE request_id = $1
          AND status = 'PROCESSING'
      `,
      [requestId, errorMessage]
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
          rowCount: result.rowCount
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
        toStatus: "QUEUED"
      }
    });

    return {
      status: "RETRY",
      retryCount: nextRetryCount,
      maxRetryCount: MAX_RETRY_COUNT
    };
  }

  const result = await pool.query(
    `
      UPDATE hub_job
      SET status = 'FAILED',
          error_message = $2,
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
      rowCount: result.rowCount
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
          AND updated_at < NOW() - INTERVAL '10 minutes'
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
