#!/usr/bin/env node
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Kafka } from "kafkajs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, "..");
const repoRoot = resolve(workerRoot, "..");

const options = parseArgs(process.argv.slice(2));
const mode = String(options.mode ?? "synthetic");
const total = toPositiveInt(options.total, 40);
const concurrency = toPositiveInt(options.concurrency, 8);
const sleepMs = toPositiveInt(options.sleepMs, 1000);
const timeoutSeconds = toPositiveInt(options.timeoutSeconds, 180);
const runId = String(options.runId ?? `load-${formatRunId(new Date())}`);
const topic = String(options.topic ?? process.env.KAFKA_TOPIC ?? "hub.jobs");

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
  const requestIds = mode === "api"
    ? await runApiLoad()
    : await runSyntheticLoad();
  const rows = await waitForCompletion(requestIds);
  const result = buildResult({ startedAt, requestIds, rows });
  const files = writeResult(result);
  await saveLoadTestRun(result, files);
  printResult(result);
} finally {
  await pool.end();
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

function buildResult({ startedAt, requestIds, rows }) {
  const durations = rows
    .map((row) => Number(row.duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const completed = rows.filter((row) => ["SUCCESS", "FAILED"].includes(row.status));
  const success = rows.filter((row) => row.status === "SUCCESS");
  const failed = rows.filter((row) => row.status === "FAILED");
  const elapsedMs = Date.now() - startedAt;

  return {
    runId,
    mode,
    totalRequested: total,
    totalJobs: requestIds.length,
    completedJobs: completed.length,
    successJobs: success.length,
    failedJobs: failed.length,
    elapsedMs,
    throughputPerMinute: round((completed.length / Math.max(elapsedMs, 1)) * 60_000),
    avgDurationMs: round(avg(durations)),
    p50DurationMs: round(percentile(durations, 0.5)),
    p95DurationMs: round(percentile(durations, 0.95)),
    maxDurationMs: round(durations.at(-1) ?? 0),
    rows
  };
}

function writeResult(result) {
  const outDir = resolve(repoRoot, "load-test-results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, `${runId}.json`);
  const csvPath = resolve(outDir, `${runId}.csv`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  writeFileSync(csvPath, toCsv(result.rows));
  return { jsonPath, csvPath };
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
        total,
        concurrency,
        sleepMs,
        timeoutSeconds,
        topic,
        apiUrl: options.apiUrl,
        mallKeys: options.mallKeys,
        baseDate: options.baseDate
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
    mode: result.mode,
    totalJobs: result.totalJobs,
    completedJobs: result.completedJobs,
    successJobs: result.successJobs,
    failedJobs: result.failedJobs,
    elapsedMs: result.elapsedMs,
    throughputPerMinute: result.throughputPerMinute,
    avgDurationMs: result.avgDurationMs,
    p50DurationMs: result.p50DurationMs,
    p95DurationMs: result.p95DurationMs,
    maxDurationMs: result.maxDurationMs
  }, null, 2));
}

function toCsv(rows) {
  const header = ["request_id", "request_key", "channel_cd", "status", "retry_count", "duration_ms", "created_at", "completed_at", "error_message"];
  const lines = rows.map((row) => header.map((key) => csvValue(row[key])).join(","));
  return [header.join(","), ...lines].join("\n");
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
