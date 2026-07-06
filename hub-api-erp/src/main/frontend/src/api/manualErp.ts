import type { AuthenticatedFetch } from './erpApply'

export type ErpConnection = {
  erpConnectionId: string
  erpType: string
  authType: string
  active: boolean
}

export type ManualErpApplyResponse = {
  commandId: string
  requested: number
  accepted: number
  skipped: number
  status: string
  skippedOrderIds: number[]
  jobs: Array<{
    requestId: string
    jobType: string
    status: string
    sourceNormalizeJobId: string
    orderCount: number
  }>
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>
  let message = `요청에 실패했습니다. (${response.status})`
  try {
    const body = await response.json() as { message?: string }
    if (body.message) message = body.message
  } catch {
    // JSON 오류 응답이 아니면 HTTP 상태 기반 메시지를 유지합니다.
  }
  throw new Error(message)
}

export async function fetchErpConnections(
  authenticatedFetch: AuthenticatedFetch,
): Promise<ErpConnection[]> {
  return parseResponse(await authenticatedFetch('/api/hub/erp/connections'))
}

export async function requestManualErpApply(
  authenticatedFetch: AuthenticatedFetch,
  request: {
    clientRequestId: string
    erpConnectionId: string
    normalizedOrderIds: number[]
    operation: 'CREATE'
    reason?: string
  },
): Promise<ManualErpApplyResponse> {
  return parseResponse(await authenticatedFetch('/api/hub/erp/apply-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }))
}
