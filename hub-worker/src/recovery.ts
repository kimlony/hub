import {
  claimZombieProcessingJobs,
  claimStuckQueuedJobs,
  type HubJobRow
} from "./db/postgres.js";
import { processJobMessage } from "./consumer.js";
import { logger } from "./logger.js";

const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

let recoveryTimer: NodeJS.Timeout | null = null;
let running = false;
let activeScan: Promise<void> | null = null;

export function startRecovery(): void {
  logger.info({
    event: "RECOVERY_STARTED",
    intervalMs: RECOVERY_INTERVAL_MS
  }, "Recovery DB scan started");

  activeScan = scanAndProcess();

  recoveryTimer = setInterval(() => {
    activeScan = scanAndProcess();
  }, RECOVERY_INTERVAL_MS);
}

export async function stopRecovery(): Promise<void> {
  logger.info({
    event: "RECOVERY_STOPPING",
    scanRunning: running
  }, "Recovery stopping");

  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }

  if (activeScan) {
    await activeScan.catch((error: unknown) => {
      logger.warn({
        event: "RECOVERY_ACTIVE_SCAN_WAIT_FAILED",
        err: error
      }, "Recovery active scan wait failed");
    });
  }

  logger.info({
    event: "RECOVERY_STOPPED"
  }, "Recovery stopped");
}

export async function scanAndProcess(): Promise<void> {
  if (running) {
    logger.warn({
      event: "RECOVERY_SCAN_SKIPPED",
      reason: "previous_scan_running"
    }, "Recovery scan skipped");
    return;
  }

  running = true;

  try {
    const jobs = await claimStuckQueuedJobs();

    if (jobs.length > 0) {
      logger.warn({
        event: "RECOVERY_STUCK_QUEUED_FOUND",
        jobCount: jobs.length
      }, "Stuck queued jobs found");

      for (const job of jobs) {
        await processStuckJob(job);
      }
    }

    const zombieJobs = await claimZombieProcessingJobs();

    if (zombieJobs.length > 0) {
      logger.warn({
        event: "RECOVERY_ZOMBIE_PROCESSING_FOUND",
        jobCount: zombieJobs.length
      }, "Zombie processing jobs found");

      for (const job of zombieJobs) {
        await processZombieProcessingJob(job);
      }
    }
  } catch (error) {
    logger.error({
      event: "RECOVERY_SCAN_FAILED",
      err: error
    }, "Recovery scan failed");
  } finally {
    running = false;
  }
}

async function processStuckJob(job: HubJobRow): Promise<void> {
  await processJobMessage({
    requestId: job.requestId,
    sourceErp: job.sourceErp,
    jobType: job.jobType,
    requestKey: job.requestKey,
    payload: job.payload
  }, "recovery", { alreadyClaimed: true });
}

async function processZombieProcessingJob(job: HubJobRow): Promise<void> {
  logger.warn({
    event: "RECOVERY_ZOMBIE_CLAIMED",
    requestId: job.requestId,
    status: "PROCESSING"
  }, "Zombie processing job claimed");

  await processJobMessage({
    requestId: job.requestId,
    sourceErp: job.sourceErp,
    jobType: job.jobType,
    requestKey: job.requestKey,
    payload: job.payload
  }, "recovery", { alreadyClaimed: true });
}
