import "dotenv/config";
import { startServer } from "./server.js";
import { startConsumer } from "./consumer.js";
import { startRecovery } from "./recovery.js";
import { ensurePostgresSchema } from "./db/postgres.js";
import {
  createWorkerHeartbeat,
  startWorkerHeartbeat,
  stopWorkerHeartbeat
} from "./heartbeat.js";
import { logger } from "./logger.js";

const PORT = Number(process.env.PORT ?? 3000);
const WORKER_ROLE = process.env.WORKER_ROLE ?? "all";
const heartbeat = createWorkerHeartbeat(WORKER_ROLE);

async function shutdown(signal: string): Promise<void> {
  logger.info({
    event: "WORKER_SHUTDOWN_SIGNAL",
    signal
  }, "Shutdown signal received");
  await stopWorkerHeartbeat(heartbeat);
  process.exit(0);
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
  startServer(PORT);
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
