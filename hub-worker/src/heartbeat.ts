import os from "node:os";
import { saveWorkerHeartbeat } from "./db/postgres.js";
import { logger } from "./logger.js";

const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 10;

let heartbeatTimer: NodeJS.Timeout | null = null;

export type WorkerHeartbeat = {
  workerId: string;
  role: string;
  pid: number;
  slot: string;
  hostname: string;
  startedAt: Date;
  intervalSeconds: number;
};

export function createWorkerHeartbeat(role: string): WorkerHeartbeat {
  const pid = process.pid;
  const slot = process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? String(pid);
  return {
    workerId: `${role}:${slot}`,
    role,
    pid,
    slot,
    hostname: os.hostname(),
    startedAt: new Date(),
    intervalSeconds: Number(process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS ?? DEFAULT_HEARTBEAT_INTERVAL_SECONDS)
  };
}

export function startWorkerHeartbeat(heartbeat: WorkerHeartbeat): void {
  void writeHeartbeat(heartbeat, "ONLINE");

  heartbeatTimer = setInterval(() => {
    void writeHeartbeat(heartbeat, "ONLINE");
  }, heartbeat.intervalSeconds * 1000);

  logger.info({
    event: "WORKER_HEARTBEAT_STARTED",
      workerId: heartbeat.workerId,
      role: heartbeat.role,
      slot: heartbeat.slot,
      intervalSeconds: heartbeat.intervalSeconds
    }, "Worker heartbeat started");
}

export async function stopWorkerHeartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  await writeHeartbeat(heartbeat, "STOPPED");
}

async function writeHeartbeat(
  heartbeat: WorkerHeartbeat,
  status: "ONLINE" | "STOPPED"
): Promise<void> {
  try {
    await saveWorkerHeartbeat({
      workerId: heartbeat.workerId,
      role: heartbeat.role,
      pid: heartbeat.pid,
      hostname: heartbeat.hostname,
      status,
      startedAt: heartbeat.startedAt,
      heartbeatIntervalSeconds: heartbeat.intervalSeconds,
      metadata: {
        nodeEnv: process.env.NODE_ENV ?? "development",
        slot: heartbeat.slot,
        pmId: process.env.pm_id ?? null,
        pm2Name: process.env.name ?? null
      }
    });
  } catch (error) {
    logger.warn({
      event: "WORKER_HEARTBEAT_SAVE_FAILED",
      err: error,
      workerId: heartbeat.workerId,
      role: heartbeat.role,
      status
    }, "Worker heartbeat save failed");
  }
}
