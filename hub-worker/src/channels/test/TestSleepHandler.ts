import { saveJobLog } from "../../db/postgres.js";
import type { IJobHandler, JobHandlerMessage } from "../../handlers/IJobHandler.js";
import { logger } from "../../logger.js";

const DEFAULT_SLEEP_MS = 60000;
const DEFAULT_MAX_SLEEP_MS = 5 * 60 * 1000;

export class TestSleepHandler implements IJobHandler {
  async handle(message: JobHandlerMessage): Promise<void> {
    const sleepMs = getSleepMs(message.payload.sleepMs);

    logger.info({
      event: "TEST_SLEEP_STARTED",
      requestId: message.requestId,
      sleepMs
    }, "Test sleep job started");

    await saveJobLog({
      requestId: message.requestId,
      eventType: "TEST_SLEEP_STARTED",
      level: "INFO",
      message: "Test sleep job started",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: getOptionalString(message.payload.channelCd),
      mallKey: getOptionalString(message.payload.mallKey),
      detail: {
        sleepMs
      }
    });

    await sleep(sleepMs);

    logger.info({
      event: "TEST_SLEEP_COMPLETED",
      requestId: message.requestId,
      sleepMs
    }, "Test sleep job completed");

    await saveJobLog({
      requestId: message.requestId,
      eventType: "TEST_SLEEP_COMPLETED",
      level: "INFO",
      message: "Test sleep job completed",
      jobType: message.jobType,
      sourceErp: message.sourceErp,
      requestKey: message.requestKey,
      channelCd: getOptionalString(message.payload.channelCd),
      mallKey: getOptionalString(message.payload.mallKey),
      detail: {
        sleepMs
      }
    });
  }
}

function getSleepMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  const sleepMs = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SLEEP_MS;
  return Math.min(sleepMs, getMaxSleepMs());
}

function getMaxSleepMs(): number {
  const parsed = Number(process.env.TEST_SLEEP_MAX_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_SLEEP_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}
