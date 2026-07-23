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

describeIntegration("job processing attempt fencing", () => {
  let db: PostgresModule;
  let pool: pg.Pool;
  const requestIds: string[] = [];

  beforeAll(async () => {
    await setupWorkerIntegrationContainers();
    pool = createIntegrationPgPool();
    db = await import("./postgres.js");
    await db.ensurePostgresSchema();
  }, 120_000);

  afterAll(async () => {
    if (requestIds.length > 0) {
      await pool?.query("DELETE FROM hub_job_attempt WHERE request_id = ANY($1)", [requestIds]);
      await pool?.query("DELETE FROM hub_job_log WHERE request_id = ANY($1)", [requestIds]);
      await pool?.query("DELETE FROM hub_job_result WHERE request_id = ANY($1)", [requestIds]).catch(() => undefined);
      await pool?.query("DELETE FROM hub_job WHERE request_id = ANY($1)", [requestIds]);
    }
    await db?.closePostgresPool();
    await pool?.end();
    await stopWorkerIntegrationContainers();
  }, 60_000);

  async function insertQueued(label: string, retryCount = 0): Promise<string> {
    const requestId = "fencing-" + label + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    requestIds.push(requestId);
    await pool.query(
      `
        INSERT INTO hub_job (
          request_id, request_key, channel_cd, status, payload, retry_count,
          job_type, source_erp, correlation_id, created_at, updated_at
        ) VALUES ($1, $2, 'TEST', 'QUEUED', '{}'::jsonb, $3,
                  'TEST_SLEEP', 'HUB_TEST', $1, NOW(), NOW())
      `,
      [requestId, "FENCING_" + requestId, retryCount]
    );
    return requestId;
  }

  it("allows exactly one worker to claim the same queued job", async () => {
    const requestId = await insertQueued("claim");
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, index) => db.tryMarkProcessing(requestId, "worker-" + index))
    );

    const winners = attempts.filter((token) => token !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ requestId, fencingToken: 1 });
  });

  it("rejects worker A after recovery issues worker B a newer token", async () => {
    // lease가 만료되면 Recovery가 Worker B에 더 새로운 token을 발급한다.
    // 이후 Worker A는 처리 권한이 바뀐 Job을 완료할 수 없어야 한다.
    const requestId = await insertQueued("stale");
    const tokenA = await db.tryMarkProcessing(requestId, "worker-a");
    expect(tokenA).not.toBeNull();

    await pool.query("UPDATE hub_job SET lease_until = NOW() - INTERVAL '1 second' WHERE request_id = $1", [requestId]);
    const recovered = await db.claimZombieProcessingJobs("worker-b");
    const tokenB = recovered.find((job) => job.requestId === requestId)?.executionToken;
    expect(tokenB).toBeDefined();
    expect(tokenB!.fencingToken).toBe(tokenA!.fencingToken + 1);

    expect(await db.succeedJob(tokenA!)).toBe(false);
    expect(await db.succeedJob(tokenB!)).toBe(true);

    const state = await pool.query("SELECT status, fencing_token FROM hub_job WHERE request_id = $1", [requestId]);
    expect(state.rows[0]).toMatchObject({ status: "SUCCESS", fencing_token: "2" });
    const staleLog = await pool.query(
      "SELECT COUNT(*)::int AS count FROM hub_job_log WHERE request_id = $1 AND event_type = 'STALE_JOB_ATTEMPT_REJECTED'",
      [requestId]
    );
    expect(staleLog.rows[0].count).toBeGreaterThanOrEqual(1);
  });

  it("only lets the current recovery attempt win a completion race", async () => {
    const requestId = await insertQueued("race");
    const tokenA = await db.tryMarkProcessing(requestId, "worker-a");
    await pool.query("UPDATE hub_job SET lease_until = NOW() - INTERVAL '1 second' WHERE request_id = $1", [requestId]);
    const recovered = await db.claimZombieProcessingJobs("worker-recovery");
    const tokenB = recovered.find((job) => job.requestId === requestId)!.executionToken;

    const outcomes = await Promise.all([db.succeedJob(tokenA!), db.succeedJob(tokenB)]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes[1]).toBe(true);
  });

  it("guards success against wrong attempt, worker, token, and completed jobs", async () => {
    const requestId = await insertQueued("guards");
    const token = (await db.tryMarkProcessing(requestId, "worker-current"))!;

    expect(await db.succeedJob({ ...token, attemptId: "00000000-0000-0000-0000-000000000001" })).toBe(false);
    expect(await db.succeedJob({ ...token, workerId: "worker-wrong" })).toBe(false);
    expect(await db.succeedJob({ ...token, fencingToken: token.fencingToken - 1 })).toBe(false);
    expect(await db.succeedJob(token)).toBe(true);
    expect(await db.succeedJob(token)).toBe(false);
  });

  it("allows retry and failed transitions only for the current attempt", async () => {
    // Retry와 FAILED도 상태 변경이므로 다른 attempt가 Job을 소유한 뒤에는
    // stale Worker가 어느 결과도 변경할 수 없어야 한다.
    const retryId = await insertQueued("retry");
    const retryToken = (await db.tryMarkProcessing(retryId, "worker-retry"))!;
    const staleRetry = await db.retryOrFailJob({ ...retryToken, workerId: "worker-old" }, "stale");
    expect(staleRetry.status).toBe("SKIPPED");
    const retry = await db.retryOrFailJob(retryToken, "temporary");
    expect(retry.status).toBe("RETRY");

    const failedId = await insertQueued("failed");
    const failedToken = (await db.tryMarkProcessing(failedId, "worker-failed"))!;
    const failed = await db.retryOrFailJob(failedToken, "bad request", { retryable: false });
    expect(failed.status).toBe("FAILED");

    const states = await pool.query(
      "SELECT request_id, status FROM hub_job WHERE request_id = ANY($1)",
      [[retryId, failedId]]
    );
    expect(Object.fromEntries(states.rows.map((row) => [row.request_id, row.status]))).toEqual({
      [retryId]: "QUEUED",
      [failedId]: "FAILED"
    });

    const attempts = await pool.query(
      "SELECT request_id, status, error_code FROM hub_job_attempt WHERE request_id = ANY($1)",
      [[retryId, failedId]]
    );
    expect(Object.fromEntries(attempts.rows.map((row) => [row.request_id, row]))).toEqual({
      [retryId]: { request_id: retryId, status: "RETRY", error_code: "RETRY_SCHEDULED" },
      [failedId]: { request_id: failedId, status: "FAILED", error_code: "NON_RETRYABLE" }
    });
  });

  it("uses lease_until only for zombie recovery after compatibility backfill", async () => {
    const nullLeaseId = await insertQueued("null-lease");
    const nullLeaseToken = (await db.tryMarkProcessing(nullLeaseId, "worker-null"))!;
    await pool.query(
      "UPDATE hub_job SET lease_until = NULL, updated_at = NOW() - INTERVAL '2 hours' WHERE request_id = $1",
      [nullLeaseId]
    );

    const notRecovered = await db.claimZombieProcessingJobs("worker-recovery");
    expect(notRecovered.some((job) => job.requestId === nullLeaseId)).toBe(false);

    await pool.query("UPDATE hub_job SET lease_until = NOW() - INTERVAL '1 second' WHERE request_id = $1", [nullLeaseId]);
    const recovered = await db.claimZombieProcessingJobs("worker-recovery");
    expect(recovered.find((job) => job.requestId === nullLeaseId)?.executionToken.fencingToken)
      .toBe(nullLeaseToken.fencingToken + 1);
  });
  it("persists claim, terminal, recovery, and stale attempt history", async () => {
    const requestId = await insertQueued("history");
    const tokenA = (await db.tryMarkProcessing(requestId, "worker-history-a"))!;

    const claimed = await pool.query(
      "SELECT status, claim_source, fencing_token FROM hub_job_attempt WHERE request_id = $1",
      [requestId]
    );
    expect(claimed.rows).toEqual([{ status: "PROCESSING", claim_source: "KAFKA", fencing_token: "1" }]);

    await expect(pool.query(
      [
        "INSERT INTO hub_job_attempt (attempt_id, request_id, job_type, fencing_token, worker_id, claim_source, status, lease_until)",
        "VALUES (gen_random_uuid(), $1, 'TEST_SLEEP', $2, 'duplicate-worker', 'KAFKA', 'PROCESSING', NOW() + INTERVAL '1 minute')"
      ].join("\n"),
      [requestId, tokenA.fencingToken]
    )).rejects.toThrow();

    await pool.query("UPDATE hub_job SET lease_until = NOW() - INTERVAL '1 second' WHERE request_id = $1", [requestId]);
    const tokenB = (await db.claimZombieProcessingJobs("worker-history-b"))
      .find((job) => job.requestId === requestId)!.executionToken;

    expect(await db.succeedJob(tokenA)).toBe(false);
    expect(await db.succeedJob(tokenB)).toBe(true);

    const attempts = await pool.query(
      "SELECT status, error_code, stale_rejected_at FROM hub_job_attempt WHERE request_id = $1 ORDER BY fencing_token",
      [requestId]
    );
    expect(attempts.rows[0]).toMatchObject({ status: "EXPIRED", error_code: "LEASE_EXPIRED" });
    expect(attempts.rows[0].stale_rejected_at).not.toBeNull();
    expect(attempts.rows[1]).toMatchObject({ status: "SUCCESS" });
  });
});
