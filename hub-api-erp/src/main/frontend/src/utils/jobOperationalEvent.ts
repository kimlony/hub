type ExecutionContext = {
  attemptId?: string
  workerId?: string
  fencingToken?: number
  leaseUntil?: string
}

export type JobOperationalEventPresentation = {
  label: string
  category?: string
  execution?: ExecutionContext
}

const EVENT_LABELS: Record<string, string> = {
  JOB_RECEIVED: 'Job 수신',
  JOB_CLAIMED: '처리 권한 획득',
  JOB_CLAIM_SKIPPED: 'Claim 생략',
  JOB_COMPLETED: '처리 완료',
  JOB_COMPLETION_SKIPPED: '완료 반영 거절',
  JOB_FAILURE_UPDATE_SKIPPED: '실패 반영 거절',
  JOB_RETRY_SCHEDULED: '재시도 예약',
  JOB_FAILED: '처리 최종 실패',
  JOB_DLQ_PUBLISHED: 'DLQ 발행',
  JOB_DLQ_PUBLISH_FAILED: 'DLQ 발행 실패',
  JOB_RECOVERED: 'Lease 만료 Recovery',
  STALE_JOB_ATTEMPT_REJECTED: 'Stale 처리 시도 거절'
}

export function getJobOperationalEventPresentation(
  eventType: string,
  detail: string | null
): JobOperationalEventPresentation {
  const parsed = parseDetail(detail)
  if (parsed?.schemaVersion !== 'job-operational-event/v1') {
    return { label: eventType }
  }

  return {
    label: EVENT_LABELS[eventType] ?? eventType,
    category: stringValue(parsed.category),
    execution: objectValue(parsed.execution) as ExecutionContext | undefined
  }
}

function parseDetail(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null
  try {
    const parsed: unknown = JSON.parse(detail)
    return objectValue(parsed)
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
