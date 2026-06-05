import "dotenv/config";
import type { Server } from "node:http";
import { startServer } from "./server.js";
import { startConsumer, stopConsumer } from "./consumer.js";
import { startRecovery, stopRecovery } from "./recovery.js";
import { closePostgresPool, ensurePostgresSchema } from "./db/postgres.js";
import {
  createWorkerHeartbeat,
  startWorkerHeartbeat,
  stopWorkerHeartbeat
} from "./heartbeat.js";
import { logger } from "./logger.js";

const PORT = Number(process.env.PORT ?? 3000);
const WORKER_ROLE = process.env.WORKER_ROLE ?? "all";
const SHUTDOWN_TIMEOUT_MS = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 60000);
const heartbeat = createWorkerHeartbeat(WORKER_ROLE);
let httpServer: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.warn({
      event: "WORKER_SHUTDOWN_ALREADY_RUNNING",
      signal
    }, "Shutdown already running");
    return;
  }

  shuttingDown = true;
  logger.info({
    event: "WORKER_SHUTDOWN_SIGNAL",
    signal,
    timeoutMs: SHUTDOWN_TIMEOUT_MS
  }, "Shutdown signal received");

  const exitCode = await withShutdownTimeout(doShutdown(signal), SHUTDOWN_TIMEOUT_MS);
  process.exit(exitCode);
}

process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });

logger.info({
  event: "WORKER_BOOT",
  role: WORKER_ROLE,
  port: PORT
}, "Worker booting");

await ensurePostgresSchema();
startWorkerHeartbeat(heartbeat);

if (WORKER_ROLE === "all" || WORKER_ROLE === "http") {
  httpServer = startServer(PORT);
}

if (WORKER_ROLE === "all" || WORKER_ROLE === "consumer") {
  startConsumer().catch(err => {
    logger.error({
      event: "KAFKA_CONSUMER_START_FAILED",
      err
    }, "Kafka consumer failed to start");
    process.exit(1);
  });
}

if (WORKER_ROLE === "all" || WORKER_ROLE === "recovery") {
  startRecovery();
}

if (!["all", "http", "consumer", "recovery"].includes(WORKER_ROLE)) {
  logger.error({
    event: "WORKER_ROLE_INVALID",
    role: WORKER_ROLE
  }, "Invalid worker role");
  process.exit(1);
}

async function doShutdown(signal: string): Promise<number> {
  try {
    if (WORKER_ROLE === "all" || WORKER_ROLE === "consumer") {
      await stopConsumer();
    }

    if (WORKER_ROLE === "all" || WORKER_ROLE === "recovery") {
      await stopRecovery();
    }

    if (httpServer) {
      await stopHttpServer(httpServer);
      httpServer = null;
    }

    await stopWorkerHeartbeat(heartbeat);
    await closePostgresPool();

    logger.info({
      event: "WORKER_SHUTDOWN_COMPLETED",
      signal
    }, "Worker shutdown completed");

    return 0;
  } catch (error) {
    logger.error({
      event: "WORKER_SHUTDOWN_FAILED",
      err: error,
      signal
    }, "Worker shutdown failed");
    return 1;
  }
}

async function stopHttpServer(server: Server): Promise<void> {
  logger.info({
    event: "HTTP_SERVER_STOPPING"
  }, "HTTP server stopping");

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  logger.info({
    event: "HTTP_SERVER_STOPPED"
  }, "HTTP server stopped");
}

async function withShutdownTimeout(work: Promise<number>, timeoutMs: number): Promise<number> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<number>((resolve) => {
        timeout = setTimeout(() => {
          logger.error({
            event: "WORKER_SHUTDOWN_TIMEOUT",
            timeoutMs
          }, "Worker shutdown timed out");
          resolve(1);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
