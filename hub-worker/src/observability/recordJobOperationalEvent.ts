import { saveJobLog } from "../db/postgres.js";
import { buildJobOperationalEventDetail, type JobOperationalEventInput } from "./jobOperationalEvent.js";

export async function recordJobOperationalEvent(input: JobOperationalEventInput): Promise<void> {
  await saveJobLog({
    requestId: input.requestId,
    eventType: input.eventType,
    level: input.level,
    message: input.message,
    jobType: input.jobType,
    sourceErp: input.sourceErp,
    requestKey: input.requestKey,
    channelCd: input.channelCd,
    mallKey: input.mallKey,
    retryCount: input.retryCount,
    maxRetryCount: input.maxRetryCount,
    errorMessage: input.errorMessage,
    detail: buildJobOperationalEventDetail(input)
  });
}
