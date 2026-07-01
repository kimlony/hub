import type { JobHandlerMessage } from "./handlers/IJobHandler.js";

type JobKeyInput = Pick<JobHandlerMessage, "requestId" | "jobType" | "payload">;

const CHANNEL_LOCK_JOB_TYPES = new Set(["ORDER_COLLECT", "ORDER_STATUS_SYNC"]);
const SOURCE_LOCK_JOB_TYPES = new Set(["EXTERNAL_ORDER_IMPORT"]);
const ERP_LOCK_JOB_TYPES = new Set(["ERP_APPLY"]);

export function resolveJobPartitionKey(job: JobKeyInput): string {
  const sourceRequestId = value(job.payload.sourceRequestId);
  if (job.jobType === "ORDER_NORMALIZE" && sourceRequestId) {
    return sourceRequestId;
  }
  return resolveJobResourceKey(job.payload) ?? job.requestId;
}

export function resolveJobLockKey(job: JobKeyInput): string | null {
  const resourceKey = resolveJobResourceKey(job.payload);
  if (!resourceKey) {
    return null;
  }
  if (CHANNEL_LOCK_JOB_TYPES.has(job.jobType) && resourceKey.startsWith("channel-account:")) {
    return resourceKey;
  }
  if (SOURCE_LOCK_JOB_TYPES.has(job.jobType) && resourceKey.startsWith("source-account:")) {
    return resourceKey;
  }
  if (ERP_LOCK_JOB_TYPES.has(job.jobType) && resourceKey.startsWith("erp-connection:")) {
    return resourceKey;
  }
  return null;
}

export function resolveJobResourceKey(payload: Record<string, unknown>): string | null {
  const tenant = value(payload.tenantId) ?? value(payload.corpId) ?? "legacy";
  const erpConnectionId = value(payload.erpConnectionId);
  if (erpConnectionId) {
    return `erp-connection:${tenant}:${erpConnectionId}`;
  }
  const sourceSystem = value(payload.sourceSystem);
  const sourceAccountId = value(payload.sourceAccountId);
  if (sourceSystem && sourceAccountId) {
    return `source-account:${tenant}:${sourceSystem}:${sourceAccountId}`;
  }
  const channelAccountId = value(payload.channelAccountId);
  return channelAccountId ? `channel-account:${tenant}:${channelAccountId}` : null;
}

function value(input: unknown): string | null {
  if (typeof input === "string") {
    return input.trim() || null;
  }
  return typeof input === "number" || typeof input === "bigint" ? String(input) : null;
}
