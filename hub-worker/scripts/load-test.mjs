#!/usr/bin/env node
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { Kafka } from "kafkajs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");
const repoRoot = resolve(workerRoot, "..");

const options = parseArgs(process.argv.slice(2));
const mode = String(options.mode ?? "synthetic");
const scenario = String(options.scenario ?? mode);
const total = toPositiveInt(options.total, 40);
const orders = toPositiveInt(options.orders, total);
const pageSize = toPositiveInt(options.pageSize, 100);
const concurrency = toPositiveInt(options.concurrency, 8);
const sleepMs = toPositiveInt(options.sleepMs, 1000);
const timeoutSeconds = toPositiveInt(options.timeoutSeconds, 180);
const runId = String(options.runId ?? `load-${formatRunId(new Date())}`);
const topic = String(options.topic ?? process.env.KAFKA_TOPIC ?? "hub.jobs");
const partitions = toPositiveInt(options.partitions, 0);
const workers = toPositiveInt(options.workers, 0);
const resourceSamples = [];

const { Pool } = pg;
const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? "hub_db",
  user: process.env.POSTGRES_USER ?? "hub",
  password: requiredEnv("POSTGRES_PASSWORD"),
  options: "-c timezone=Asia/Seoul",
  max: 5
});

try {
  const startedAt = Date.now();
  const stopResourceSampling = startResourceSampler();
  const requestIds = await runLoad();
  const rows = await waitForCompletion(requestIds);
  const normalizeRows = isMockMallLoadMode() ? await waitForNormalizeCompletion(requestIds) : [];
  stopResourceSampling();
  const result = await buildResult({ startedAt, requestIds, rows, normalizeRows });
  const files = writeResult(result);
  await saveLoadTestRun(result, files);
  printResult(result);
} finally {
  await pool.end();
}

async function runLoad() {
  if (mode === "api") {
    return runApiLoad();
  }

  if (mode === "mock-mall") {
    return runMockMallLoad();
  }

  if (mode === "mock-mall-e2e") {
    return runMockMallE2ELoad();
  }

  return runSyntheticLoad();
}

async function runSyntheticLoad() {
  const kafka = new Kafka({
    clientId: `hub-load-test-${runId}`,
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((broker) => broker.trim())
      .filter(Boolean)
  });
  const producer = kafka.producer();
  await producer.connect();

  try {
    const jobs = Array.from({ length: total }, (_, index) => {
      const requestId = randomUUID();
      const requestKey = `${runId}_TEST_SLEEP_${String(index + 1).padStart(5, "0")}`;
      const payload = {
        channelCd: "TEST",
        mallKey: "TEST",
        sleepMs,
        loadTest: true,
        runId,
        index: index + 1
      };
      return { requestId, requestKey, payload };
    });

    await runInBatches(jobs, concurrency, async (job) => {
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
          ) VALUES ($1, $2, 'TEST', 'QUEUED', $3::json, 0, 'TEST_SLEEP', 'HUB', NOW(), NOW())
        `,
        [job.requestId, job.requestKey, JSON.stringify(job.payload)]
      );

      await producer.send({
        topic,
        messages: [{
          key: job.requestId,
          value: JSON.stringify({
            requestId: job.requestId,
            sourceErp: "HUB",
            jobType: "TEST_SLEEP",
            requestKey: job.requestKey,
            payload: job.payload
          })
        }]
      });
    });

    return jobs.map((job) => job.requestId);
  } finally {
    await producer.disconnect();
  }
}

async function runMockMallLoad() {
  const kafka = new Kafka({
    clientId: `hub-load-test-${runId}`,
    brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
      .split(",")
      .map((broker) => broker.trim())
      .filter(Boolean)
  });
  const producer = kafka.producer();
  const admin = kafka.admin();
  await admin.connect();
  await ensureTopicPartitions(admin);
  await admin.disconnect();
  await producer.connect();

  const mallKey = String(options.mallKey ?? process.env.LOAD_TEST_MALL_KEY ?? "mock-mall-001");
  const seed = String(options.seed ?? process.env.LOAD_TEST_SEED ?? "mock-load-test-001");
  const delayMs = toNonNegativeNumber(options.delayMs, 0);
  const errorRate = toRate(options.errorRate);
  const timeoutRate = toRate(options.timeoutRate);
  const userId = toPositiveInt(options.userId, 1);
  const accountResult = await pool.query(
    `
      WITH target_user AS (
        SELECT id, corp_id FROM users WHERE id = $1
      ), inserted AS (
        INSERT INTO user_malls (corp_id, user_id, mall_key, account_name, use_yn)
        SELECT corp_id, id, 'MOCK_MALL', 'Mock Mall Load Test', 'Y'
        FROM target_user
        ON CONFLICT (corp_id, mall_key) WHERE mall_key = 'MOCK_MALL'
        DO UPDATE SET use_yn = 'Y'
        RETURNING id, corp_id
      )
      SELECT id, corp_id FROM inserted
    `,
    [userId]
  );
  if (accountResult.rows.length === 0) {
    throw new Error(`Load-test user not found: userId=${userId}`);
  }
  const channelAccountId = Number(accountResult.rows[0].id);
  const corpId = Number(accountResult.rows[0].corp_id);
  const totalPages = Math.ceil(orders / pageSize);

  try {
    const jobs = Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1;
      const requestId = randomUUID();
      const requestKey = `${runId}_MOCK_MALL_${String(page).padStart(5, "0")}`;
      const payload = {
        userId,
        corpId,
        channelAccountId,
        channelCd: "MOCK_MALL",
        mallKey,
        page,
        size: pageSize,
        totalCount: orders,
        seed,
        delayMs,
        errorRate,
        timeoutRate,
        loadTest: true,
        runId,
        scenario
      };
      return { requestId, requestKey, payload };
    });

    await runInBatches(jobs, concurrency, async (job) => {
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
          ) VALUES ($1, $2, 'MOCK_MALL', 'QUEUED', $3::json, 0, 'ORDER_COLLECT', 'HUB', NOW(), NOW())
          ON CONFLICT (request_key) DO NOTHING
        `,
        [job.requestId, job.requestKey, JSON.stringify(job.payload)]
      );

      await producer.send({
        topic,
        messages: [{
          key: `MOCK_MALL:${userId}:${mallKey}:${job.payload.page}`,
          value: JSON.stringify({
            requestId: job.requestId,
            sourceErp: "HUB",
            jobType: "ORDER_COLLECT",
            requestKey: job.requestKey,
            payload: job.payload
          })
        }]
      });
    });

    return jobs.map((job) => job.requestId);
  } finally {
    await producer.disconnect();
  }
}

async function runMockMallE2ELoad() {
  const apiUrl = String(options.apiUrl ?? process.env.HUB_API_URL ?? "http://localhost:8080");
  const token = await resolveToken(apiUrl);
  const mallKey = String(options.mallKey ?? process.env.LOAD_TEST_MALL_KEY ?? "MOCK_MALL");
  const seed = String(options.seed ?? process.env.LOAD_TEST_SEED ?? "mock-load-test-001");
  const delayMs = toNonNegativeNumber(options.delayMs, 0);
  const errorRate = toRate(options.errorRate);
  const timeoutRate = toRate(options.timeoutRate);
  const totalPages = Math.ceil(orders / pageSize);
  const baseDate = parseBaseDate(String(options.baseDate ?? process.env.LOAD_TEST_BASE_DATE ?? "2026-01-01"));
  const requestIds = [];

  await runInBatches(Array.from({ length: totalPages }, (_, index) => index), concurrency, async (index) => {
    const page = index + 1;
    const date = formatYyyyMMdd(addDays(baseDate, index));
    const response = await fetch(`${apiUrl}/api/hub/jobs/batch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        frDt: date,
        toDt: date,
        mallKeys: [mallKey],
        mockPage: page,
        mockSize: pageSize,
        mockTotalCount: orders,
        mockSeed: seed,
        mockDelayMs: delayMs,
        mockErrorRate: errorRate,
        mockTimeoutRate: timeoutRate,
        loadTestRunId: runId,
        scenario
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`mock mall e2e batch request failed: ${response.status} ${body}`);
    }

    const body = await response.json();
    for (const job of body.jobs ?? []) {
      if (job.requestId) {
        requestIds.push(job.requestId);
      }
    }
  });

  return requestIds;
}

async function ensureTopicPartitions(admin) {
  if (!partitions) {
    return;
  }

  await admin.createTopics({
    waitForLeaders: true,
    topics: [{ topic, numPartitions: partitions, replicationFactor: 1 }]
  });

  const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
  const currentPartitions = metadata.topics
    .find((candidate) => candidate.name === topic)
    ?.partitions.length ?? 0;

  if (currentPartitions >= partitions) {
    return;
  }

  try {
    await admin.createPartitions({
      topicPartitions: [{ topic, count: partitions }]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("less than") && !message.includes("already")) {
      throw error;
    }
  }
}

async function runApiLoad() {
  const apiUrl = String(options.apiUrl ?? process.env.HUB_API_URL ?? "http://localhost:8080");
  const mallKeys = String(options.mallKeys ?? process.env.LOAD_TEST_MALL_KEYS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!mallKeys.length) {
    throw new Error("api mode requires --mallKeys=11ST,GODO or LOAD_TEST_MALL_KEYS");
  }

  const token = await resolveToken(apiUrl);
  const requestIds = [];
  const baseDate = parseBaseDate(String(options.baseDate ?? process.env.LOAD_TEST_BASE_DATE ?? "2026-01-01"));

  await runInBatches(Array.from({ length: total }, (_, index) => index), concurrency, async (index) => {
    const date = formatYyyyMMdd(addDays(baseDate, index));
    const response = await fetch(`${apiUrl}/api/hub/jobs/batch`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        frDt: date,
        toDt: date,
        mallKeys
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`batch request failed: ${response.status} ${body}`);
    }

    const body = await response.json();
    for (const job of body.jobs ?? []) {
      if (job.requestId) {
        requestIds.push(job.requestId);
      }
    }
  });

  return requestIds;
}

async function resolveToken(apiUrl) {
  const token = String(options.token ?? process.env.HUB_TOKEN ?? "");
  if (token) {
    return token;
  }

  const username = String(options.username ?? process.env.HUB_USERNAME ?? "");
  const password = String(options.password ?? process.env.HUB_PASSWORD ?? "");
  if (!username || !password) {
    throw new Error("api mode requires HUB_TOKEN or HUB_USERNAME/HUB_PASSWORD");
  }

  const response = await fetch(`${apiUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status}`);
  }
  const body = await response.json();
  return body.token;
}

async function waitForCompletion(requestIds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const rows = await selectJobRows(requestIds);
    const doneCount = rows.filter((row) => ["SUCCESS", "FAILED"].includes(row.status)).length;
    process.stdout.write(`\rcompleted ${doneCount}/${requestIds.length}`);
    if (doneCount >= requestIds.length) {
      process.stdout.write("\n");
      return rows;
    }
    await sleep(1000);
  }
  process.stdout.write("\n");
  return selectJobRows(requestIds);
}

async function waitForNormalizeCompletion(sourceRequestIds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const rows = await selectNormalizeRows(sourceRequestIds);
    const doneCount = rows.filter((row) => ["SUCCESS", "FAILED"].includes(row.status)).length;
    process.stdout.write(`\rnormalize completed ${doneCount}/${sourceRequestIds.length}`);
    if (rows.length >= sourceRequestIds.length && doneCount >= sourceRequestIds.length) {
      process.stdout.write("\n");
      return rows;
    }
    await sleep(1000);
  }
  process.stdout.write("\n");
  return selectNormalizeRows(sourceRequestIds);
}

async function selectJobRows(requestIds) {
  if (!requestIds.length) {
    return [];
  }
  const result = await pool.query(
    `
      SELECT
        request_id,
        request_key,
        channel_cd,
        status,
        retry_count,
        error_message,
        EXTRACT(EPOCH FROM (
          CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
            ELSE NULL
          END - created_at
        )) * 1000 AS duration_ms,
        to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        to_char((
          CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
            ELSE NULL
          END
        ) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS completed_at
      FROM hub_job
      WHERE request_id = ANY($1)
      ORDER BY created_at ASC
    `,
    [requestIds]
  );
  return result.rows;
}

async function selectNormalizeRows(sourceRequestIds) {
  if (!sourceRequestIds.length) {
    return [];
  }

  const requestKeys = sourceRequestIds.map((requestId) => `NORMALIZE_${requestId}`);
  const result = await pool.query(
    `
      SELECT
        request_id,
        request_key,
        channel_cd,
        status,
        retry_count,
        error_message,
        EXTRACT(EPOCH FROM (
          CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
            ELSE NULL
          END - created_at
        )) * 1000 AS duration_ms,
        to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
        to_char((
          CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN status IN ('SUCCESS', 'FAILED') THEN updated_at
            ELSE NULL
          END
        ) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') AS completed_at
      FROM hub_job
      WHERE request_key = ANY($1)
      ORDER BY created_at ASC
    `,
    [requestKeys]
  );
  return result.rows;
}

async function buildResult({ startedAt, requestIds, rows, normalizeRows = [] }) {
  const durations = rows
    .map((row) => Number(row.duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const completed = rows.filter((row) => ["SUCCESS", "FAILED"].includes(row.status));
  const success = rows.filter((row) => row.status === "SUCCESS");
  const failed = rows.filter((row) => row.status === "FAILED");
  const normalizeCompleted = normalizeRows.filter((row) => ["SUCCESS", "FAILED"].includes(row.status));
  const normalizedOrders = isMockMallLoadMode() ? await countNormalizedOrders(runId) : 0;
  const dlqMessages = await countDlqMessages(runId);
  const outboxSummary = mode === "mock-mall-e2e" ? await countOutboxEvents(runId) : null;
  const resourceSummary = summarizeResourceSamples(resourceSamples);
  const elapsedMs = Date.now() - startedAt;

  return {
    runId,
    scenario,
    mode,
    totalRequested: isMockMallLoadMode() ? orders : total,
    totalJobs: requestIds.length,
    totalCollectJobs: requestIds.length,
    totalNormalizeJobs: normalizeRows.length,
    completedJobs: completed.length,
    completedNormalizeJobs: normalizeCompleted.length,
    successJobs: success.length,
    failedJobs: failed.length,
    dlqMessages,
    outboxSummary,
    normalizedOrders,
    elapsedMs,
    ordersPerSecond: round((normalizedOrders || completed.length) / Math.max(elapsedMs, 1) * 1000),
    jobsPerSecond: round((completed.length / Math.max(elapsedMs, 1)) * 1000),
    throughputPerMinute: round((completed.length / Math.max(elapsedMs, 1)) * 60_000),
    avgDurationMs: round(avg(durations)),
    p50DurationMs: round(percentile(durations, 0.5)),
    p95DurationMs: round(percentile(durations, 0.95)),
    maxDurationMs: round(durations.at(-1) ?? 0),
    topicPartitions: partitions || null,
    workerConsumers: workers || null,
    resourceSummary,
    rows
  };
}

async function countNormalizedOrders(currentRunId) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM hub_collected_order
      WHERE request_id IN (
          SELECT request_id
          FROM hub_job_result
          WHERE result_payload ->> 'runId' = $1
        )
    `,
    [currentRunId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countDlqMessages(currentRunId) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM hub_job_log
      WHERE event_type = 'JOB_DLQ_PUBLISHED'
        AND (
          detail ->> 'runId' = $1
          OR request_key LIKE $2
        )
    `,
    [currentRunId, `${currentRunId}%`]
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countOutboxEvents(currentRunId) {
  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'PUBLISHING')::int AS publishing,
        COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
      FROM hub_job_outbox
      WHERE payload -> 'payload' ->> 'runId' = $1
    `,
    [currentRunId]
  );

  const row = result.rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    pending: Number(row.pending ?? 0),
    publishing: Number(row.publishing ?? 0),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0)
  };
}

function writeResult(result) {
  const outDir = resolve(repoRoot, "load-test-results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, `${runId}.json`);
  const csvPath = resolve(outDir, `${runId}.csv`);
  const markdownPath = resolve(outDir, `${runId}.md`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  writeFileSync(csvPath, toCsv(result.rows));
  writeFileSync(markdownPath, toMarkdown(result));
  return { jsonPath, csvPath, markdownPath };
}

async function saveLoadTestRun(result, files) {
  await ensureLoadTestSchema();
  await pool.query(
    `
      INSERT INTO hub_load_test_run (
        run_id,
        mode,
        total_requested,
        total_jobs,
        completed_jobs,
        success_jobs,
        failed_jobs,
        elapsed_ms,
        throughput_per_minute,
        avg_duration_ms,
        p50_duration_ms,
        p95_duration_ms,
        max_duration_ms,
        params,
        result_path
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14::jsonb, $15
      )
      ON CONFLICT (run_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        total_requested = EXCLUDED.total_requested,
        total_jobs = EXCLUDED.total_jobs,
        completed_jobs = EXCLUDED.completed_jobs,
        success_jobs = EXCLUDED.success_jobs,
        failed_jobs = EXCLUDED.failed_jobs,
        elapsed_ms = EXCLUDED.elapsed_ms,
        throughput_per_minute = EXCLUDED.throughput_per_minute,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        p50_duration_ms = EXCLUDED.p50_duration_ms,
        p95_duration_ms = EXCLUDED.p95_duration_ms,
        max_duration_ms = EXCLUDED.max_duration_ms,
        params = EXCLUDED.params,
        result_path = EXCLUDED.result_path,
        created_at = NOW()
    `,
    [
      result.runId,
      result.mode,
      result.totalRequested,
      result.totalJobs,
      result.completedJobs,
      result.successJobs,
      result.failedJobs,
      result.elapsedMs,
      result.throughputPerMinute,
      result.avgDurationMs,
      result.p50DurationMs,
      result.p95DurationMs,
      result.maxDurationMs,
      JSON.stringify({
        scenario,
        total,
        orders,
        pageSize,
        concurrency,
        sleepMs,
        timeoutSeconds,
        topic,
        partitions,
        workers,
        apiUrl: options.apiUrl,
        mallKeys: options.mallKeys,
        baseDate: options.baseDate,
        seed: options.seed,
        delayMs: options.delayMs,
        errorRate: options.errorRate,
        timeoutRate: options.timeoutRate
      }),
      files.jsonPath
    ]
  );
}

async function ensureLoadTestSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hub_load_test_run (
      id BIGSERIAL PRIMARY KEY,
      run_id VARCHAR(80) NOT NULL UNIQUE,
      mode VARCHAR(30) NOT NULL,
      total_requested INTEGER NOT NULL,
      total_jobs INTEGER NOT NULL,
      completed_jobs INTEGER NOT NULL,
      success_jobs INTEGER NOT NULL,
      failed_jobs INTEGER NOT NULL,
      elapsed_ms BIGINT NOT NULL,
      throughput_per_minute DOUBLE PRECISION NOT NULL,
      avg_duration_ms DOUBLE PRECISION NOT NULL,
      p50_duration_ms DOUBLE PRECISION NOT NULL,
      p95_duration_ms DOUBLE PRECISION NOT NULL,
      max_duration_ms DOUBLE PRECISION NOT NULL,
      params JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_path VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hub_load_test_run_created_at
      ON hub_load_test_run(created_at DESC)
  `);
}

function printResult(result) {
  console.log(JSON.stringify({
    runId: result.runId,
    scenario: result.scenario,
    mode: result.mode,
    totalJobs: result.totalJobs,
    totalCollectJobs: result.totalCollectJobs,
    totalNormalizeJobs: result.totalNormalizeJobs,
    completedJobs: result.completedJobs,
    completedNormalizeJobs: result.completedNormalizeJobs,
    successJobs: result.successJobs,
    failedJobs: result.failedJobs,
    dlqMessages: result.dlqMessages,
    outboxSummary: result.outboxSummary,
    normalizedOrders: result.normalizedOrders,
    elapsedMs: result.elapsedMs,
    ordersPerSecond: result.ordersPerSecond,
    jobsPerSecond: result.jobsPerSecond,
    throughputPerMinute: result.throughputPerMinute,
    avgDurationMs: result.avgDurationMs,
    p50DurationMs: result.p50DurationMs,
    p95DurationMs: result.p95DurationMs,
    maxDurationMs: result.maxDurationMs,
    topicPartitions: result.topicPartitions,
    workerConsumers: result.workerConsumers,
    resourceSummary: result.resourceSummary
  }, null, 2));
}

function toCsv(rows) {
  const header = ["request_id", "request_key", "channel_cd", "status", "retry_count", "duration_ms", "created_at", "completed_at", "error_message"];
  const lines = rows.map((row) => header.map((key) => csvValue(row[key])).join(","));
  return [header.join(","), ...lines].join("\n");
}

function toMarkdown(result) {
  return [
    `# Load Test Result: ${result.runId}`,
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Scenario | ${result.scenario} |`,
    `| Mode | ${result.mode} |`,
    `| Total requested | ${result.totalRequested} |`,
    `| Collect jobs | ${result.totalCollectJobs} |`,
    `| Normalize jobs | ${result.totalNormalizeJobs} |`,
    `| Completed collect jobs | ${result.completedJobs} |`,
    `| Completed normalize jobs | ${result.completedNormalizeJobs} |`,
    `| Success jobs | ${result.successJobs} |`,
    `| Failed jobs | ${result.failedJobs} |`,
    `| DLQ messages | ${result.dlqMessages} |`,
    `| Outbox total | ${result.outboxSummary?.total ?? "-"} |`,
    `| Outbox sent | ${result.outboxSummary?.sent ?? "-"} |`,
    `| Outbox pending | ${result.outboxSummary?.pending ?? "-"} |`,
    `| Outbox failed | ${result.outboxSummary?.failed ?? "-"} |`,
    `| Normalized orders | ${result.normalizedOrders} |`,
    `| Elapsed ms | ${result.elapsedMs} |`,
    `| Orders/sec | ${result.ordersPerSecond} |`,
    `| Jobs/sec | ${result.jobsPerSecond} |`,
    `| Avg duration ms | ${result.avgDurationMs} |`,
    `| P50 duration ms | ${result.p50DurationMs} |`,
    `| P95 duration ms | ${result.p95DurationMs} |`,
    `| Max duration ms | ${result.maxDurationMs} |`,
    `| Topic partitions | ${result.topicPartitions ?? "-"} |`,
    `| Worker consumers | ${result.workerConsumers ?? "-"} |`,
    `| Avg CPU % | ${result.resourceSummary?.avgCpuPercent ?? "-"} |`,
    `| Max CPU % | ${result.resourceSummary?.maxCpuPercent ?? "-"} |`,
    `| Avg memory MB | ${result.resourceSummary?.avgMemoryMb ?? "-"} |`,
    `| Max memory MB | ${result.resourceSummary?.maxMemoryMb ?? "-"} |`,
    ""
  ].join("\n");
}

function csvValue(value) {
  if (value == null) {
    return "";
  }
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function runInBatches(items, batchSize, worker) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(worker));
  }
}

function parseArgs(args) {
  return args.reduce((acc, arg) => {
    if (!arg.startsWith("--")) {
      return acc;
    }
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function toNonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toRate(value) {
  return Math.max(0, Math.min(toNonNegativeNumber(value, 0), 1));
}

function isMockMallLoadMode() {
  return mode === "mock-mall" || mode === "mock-mall-e2e";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[index] ?? 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startResourceSampler() {
  if (String(options.sampleDockerStats ?? "false") !== "true") {
    return () => {};
  }

  const timer = setInterval(() => {
    try {
      const sample = sampleDockerStats();
      if (sample.length) {
        resourceSamples.push({ sampledAt: Date.now(), containers: sample });
      }
    } catch {
      // Docker stats are optional. Load-test execution should not fail when
      // resource sampling is unavailable on the current machine.
    }
  }, 1000);

  return () => clearInterval(timer);
}

function sampleDockerStats() {
  const output = execFileSync("docker", ["stats", "--no-stream", "--format", "{{json .}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function summarizeResourceSamples(samples) {
  if (!samples.length) {
    return null;
  }

  const cpuValues = [];
  const memoryValues = [];

  for (const sample of samples) {
    for (const container of sample.containers) {
      cpuValues.push(parsePercent(container.CPUPerc));
      memoryValues.push(parseMemoryMb(container.MemUsage));
    }
  }

  return {
    sampleCount: samples.length,
    avgCpuPercent: round(avg(cpuValues.filter(Number.isFinite))),
    maxCpuPercent: round(Math.max(0, ...cpuValues.filter(Number.isFinite))),
    avgMemoryMb: round(avg(memoryValues.filter(Number.isFinite))),
    maxMemoryMb: round(Math.max(0, ...memoryValues.filter(Number.isFinite)))
  };
}

function parsePercent(value) {
  return Number(String(value ?? "").replace("%", ""));
}

function parseMemoryMb(value) {
  const text = String(value ?? "").split("/")[0]?.trim() ?? "";
  const match = text.match(/^([\d.]+)([KMGT]?i?B)$/i);
  if (!match) {
    return Number.NaN;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("k")) return amount / 1024;
  if (unit.startsWith("g")) return amount * 1024;
  if (unit.startsWith("t")) return amount * 1024 * 1024;
  return amount;
}

function formatRunId(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseBaseDate(value) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid base date: ${value}`);
  }
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatYyyyMMdd(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
