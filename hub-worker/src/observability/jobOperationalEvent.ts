import type { JobExecutionToken, JobLogLevel } from "../db/postgres.js";

export const JOB_OPERATIONAL_EVENT_SCHEMA_VERSION = "job-operational-event/v1";

export type JobOperationalEventSource = "KAFKA" | "RECOVERY" | "MANUAL" | "SYSTEM";

export type JobOperationalEventCategory =
  | "INTAKE"
  | "CLAIM"
  | "EXECUTION"
  | "RETRY"
  | "RECOVERY"
  | "FENCING"
  | "DLQ";

export type KafkaEventContext = {
  topic: string;
  partition: number;
  offset: string;
  messageKey: string | null;
  kafkaMessageId: string;
};

export type JobOperationalEventInput = {
  requestId: string;
  eventType: string;
  level: JobLogLevel;
  message: string;
  jobType?: string | null;
  sourceErp?: string | null;
  requestKey?: string | null;
  channelCd?: string | null;
  mallKey?: string | null;
  retryCount?: number | null;
  maxRetryCount?: number | null;
  errorMessage?: string | null;
  source: JobOperationalEventSource;
  workerInstanceId?: string;
  kafkaClientId?: string;
  executionToken?: JobExecutionToken | null;
  kafka?: KafkaEventContext;
  correlationId?: string | null;
  parentJobId?: string | null;
  causationId?: string | null;
  attributes?: Record<string, unknown>;
};

type SanitizedValue = string | number | boolean | null | SanitizedValue[] | { [key: string]: SanitizedValue };

const EVENT_CATEGORIES: Record<string, JobOperationalEventCategory> = {
  JOB_RECEIVED: "INTAKE",
  JOB_CLAIMED: "CLAIM",
  JOB_CLAIM_SKIPPED: "CLAIM",
  JOB_COMPLETED: "EXECUTION",
  JOB_COMPLETION_SKIPPED: "FENCING",
  JOB_FAILURE_UPDATE_SKIPPED: "FENCING",
  JOB_RETRY_SCHEDULED: "RETRY",
  JOB_FAILED: "EXECUTION",
  JOB_DLQ_PUBLISHED: "DLQ",
  JOB_DLQ_PUBLISH_FAILED: "DLQ",
  JOB_RECOVERED: "RECOVERY",
  STALE_JOB_ATTEMPT_REJECTED: "FENCING"
};

const SENSITIVE_KEY = /password|secret|authorization|cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|payload|buyer|recipient|phone|address|email/i;
const MAX_STRING_LENGTH = 500;
const MAX_COLLECTION_SIZE = 20;
const MAX_DEPTH = 3;

export function buildJobOperationalEventDetail(input: JobOperationalEventInput): Record<string, unknown> {
  const execution = input.executionToken
    ? {
        attemptId: input.executionToken.attemptId,
        workerId: input.executionToken.workerId,
        fencingToken: input.executionToken.fencingToken,
        leaseUntil: input.executionToken.leaseUntil.toISOString()
      }
    : undefined;

  return withoutUndefined({
    schemaVersion: JOB_OPERATIONAL_EVENT_SCHEMA_VERSION,
    category: EVENT_CATEGORIES[input.eventType] ?? "EXECUTION",
    source: input.source,
    workerInstanceId: input.workerInstanceId,
    kafkaClientId: input.kafkaClientId,
    kafka: input.kafka,
    execution,
    correlation: withoutUndefined({
      correlationId: input.correlationId,
      parentJobId: input.parentJobId,
      causationId: input.causationId
    }),
    attributes: sanitizeAttributes(input.attributes ?? {})
  });
}

function withoutUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, SanitizedValue> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeValue(value, 0)])
  );
}

function sanitizeValue(value: unknown, depth: number): SanitizedValue {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}...`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return "[TRUNCATED]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_COLLECTION_SIZE).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_COLLECTION_SIZE)
        .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeValue(item, depth + 1)])
    );
  }
  return String(value);
}
