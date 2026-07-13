export type JobAttemptStatus = 'PROCESSING' | 'SUCCESS' | 'RETRY' | 'FAILED' | 'EXPIRED' | string
export type ClaimSource = 'KAFKA' | 'RECOVERY' | 'MANUAL' | 'MIGRATION' | string

export type JobAttempt = {
  id: number
  attemptId: string
  jobId: string
  requestId: string
  jobType: string
  fencingToken: number
  workerId: string | null
  claimSource: ClaimSource
  status: JobAttemptStatus
  claimedAt: string
  leaseUntil: string | null
  completedAt: string | null
  durationMs: number | null
  errorCode: string | null
  errorMessage: string | null
  staleRejectedAt: string | null
}

export type JobExecutionDuration = {
  jobType: string
  averageDurationMs: number | null
  p95DurationMs: number | null
  p99DurationMs: number | null
}

export type JobExecutionMetrics = {
  from: string
  to: string
  jobType: string | null
  totalAttempts: number
  successAttempts: number
  recoveryAttempts: number
  leaseExpiredAttempts: number
  staleRejectedAttempts: number
  averageAttemptsPerJob: number | null
  durations: JobExecutionDuration[]
}

type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function fetchJobAttempts(
  authenticatedFetch: AuthenticatedFetch,
  jobId: string,
): Promise<JobAttempt[]> {
  const response = await authenticatedFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/attempts`)
  if (!response.ok) throw new Error('처리 시도 이력을 조회하지 못했습니다.')

  return response.json() as Promise<JobAttempt[]>
}

export async function fetchJobExecutionMetrics(
  authenticatedFetch: AuthenticatedFetch,
  filters: { from: string; to: string; jobType: string },
): Promise<JobExecutionMetrics> {
  const params = new URLSearchParams({ from: filters.from, to: filters.to })
  if (filters.jobType) params.set('jobType', filters.jobType)

  const response = await authenticatedFetch(`/api/admin/job-execution-metrics?${params.toString()}`)
  if (!response.ok) throw new Error('Job 실행 지표를 조회하지 못했습니다.')

  return response.json() as Promise<JobExecutionMetrics>
}
