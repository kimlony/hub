export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ErpApplyResult = {
  id: number
  requestId: string
  correlationId: string
  normalizedOrderId: number
  erpConnectionId: string
  operation: string
  status: string
  idempotencyKey: string
  erpDocumentNo: string | null
  errorCode: string | null
  errorMessage: string | null
  attemptCount: number
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ErpApplyResultsResponse = {
  results: ErpApplyResult[]
  totalCount: number
  page: number
  size: number
}

export type ErpApplyResultDetail = {
  result: ErpApplyResult
  payloadSummary: { requestBytes: number; responseBytes: number }
  requestPayload: unknown
  responsePayload: unknown
}

export type PipelineJob = {
  requestId: string
  jobType: string
  status: string
  parentJobId: string | null
  causationId: string | null
  retryCount: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type PipelineErpResult = {
  requestId: string
  normalizedOrderId: number
  status: string
  erpDocumentNo: string | null
  errorCode: string | null
  errorMessage: string | null
}

export type JobPipeline = {
  correlationId: string
  rootJobId: string
  currentStage: string
  failedStage: string | null
  retryable: boolean
  retryFromJobType: string | null
  jobs: PipelineJob[]
  erpApplyResults: PipelineErpResult[]
}

export type ErpApplyResultParams = {
  corpId: string
  status?: string
  erpConnectionId?: string
  correlationId?: string
  requestId?: string
  page: number
  size: number
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  let message = `요청에 실패했습니다. (${response.status})`
  try {
    const body = await response.json() as { message?: string }
    if (body.message) message = body.message
  } catch {
    // Keep the status-based message when the server did not return JSON.
  }
  throw new Error(message)
}

export async function fetchErpApplyResults(
  authenticatedFetch: AuthenticatedFetch,
  params: ErpApplyResultParams,
): Promise<ErpApplyResultsResponse> {
  const query = new URLSearchParams({ corpId: params.corpId, page: String(params.page), size: String(params.size) })
  if (params.status) query.set('status', params.status)
  if (params.erpConnectionId) query.set('erpConnectionId', params.erpConnectionId)
  if (params.correlationId) query.set('correlationId', params.correlationId)
  if (params.requestId) query.set('requestId', params.requestId)
  return parseResponse(await authenticatedFetch(`/api/hub/erp/apply-results?${query}`))
}

export async function fetchErpApplyResultDetail(
  authenticatedFetch: AuthenticatedFetch,
  id: number,
  corpId: string,
): Promise<ErpApplyResultDetail> {
  const query = new URLSearchParams({ corpId })
  return parseResponse(await authenticatedFetch(`/api/hub/erp/apply-results/${id}?${query}`))
}

export async function fetchJobPipeline(
  authenticatedFetch: AuthenticatedFetch,
  requestId: string,
  corpId: string,
): Promise<JobPipeline> {
  const query = new URLSearchParams({ corpId })
  return parseResponse(await authenticatedFetch(`/api/hub/jobs/${encodeURIComponent(requestId)}/pipeline?${query}`))
}
export async function retryErpApplyJob(
  authenticatedFetch: AuthenticatedFetch,
  requestId: string,
): Promise<void> {
  const response = await authenticatedFetch(`/api/hub/jobs/${encodeURIComponent(requestId)}/retry`, {
    method: 'POST',
  })
  if (!response.ok) {
    let message = `ERP_APPLY 재처리에 실패했습니다. (${response.status})`
    try {
      const body = await response.json() as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new Error(message)
  }
}
export type JobLog = {
  id: number
  requestId: string
  eventType: string
  level: string
  message: string
  channelCd: string | null
  mallKey: string | null
  retryCount: number | null
  maxRetryCount: number | null
  errorMessage: string | null
  detail: string | null
  createdAt: string
}

export type JobLogsResponse = {
  requestId: string
  logs: JobLog[]
}

export async function fetchJobLogs(
  authenticatedFetch: AuthenticatedFetch,
  requestId: string,
): Promise<JobLogsResponse> {
  return parseResponse(await authenticatedFetch(`/api/hub/jobs/${encodeURIComponent(requestId)}/logs`))
}