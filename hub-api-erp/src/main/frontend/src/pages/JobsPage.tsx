import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import CollectRequestModal from '../components/CollectRequestModal'
import JobAttemptPanel from '../components/JobAttemptPanel'
import { useAuth } from '../context/AuthContext'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { getJobOperationalEventPresentation } from '../utils/jobOperationalEvent'

type Job = {
  requestId: string
  jobType: string
  channelCd: string
  frDt: string
  toDt: string
  status: string
  retryCount: number
  errorMessage: string | null
  createdAt: string
}

type JobsResponse = {
  jobs: Job[]
  totalCount: number
  page: number
  size: number
}

type JobLog = {
  id: number
  requestId: string
  eventType: string
  level: 'INFO' | 'WARN' | 'ERROR' | string
  message: string
  channelCd: string | null
  mallKey: string | null
  retryCount: number | null
  maxRetryCount: number | null
  errorMessage: string | null
  detail: string | null
  createdAt: string
}

type JobLogsResponse = {
  requestId: string
  logs: JobLog[]
}

type FailureInfo = {
  code: string
  label: string
  retryable: boolean | null
  reason: string
}

const CHANNEL_COLORS: Record<string, string> = {
  '11ST': 'bg-red-50 text-red-600',
  GCHAN: 'bg-orange-50 text-orange-600',
  COUPANG: 'bg-rose-50 text-rose-700',
  NSS: 'bg-[#E8FAF0] text-[#00C073]',
  MOCK_MALL: 'bg-blue-50 text-blue-700',
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO: 'bg-blue-50 text-blue-700',
  WARN: 'bg-amber-50 text-amber-700',
  ERROR: 'bg-red-50 text-red-700',
}

const PAGE_SIZE = 20

const JOB_TYPE_LABELS: Record<string, string> = {
  ORDER_COLLECT: '주문수집',
  ORDER_STATUS_SYNC: '주문상태 동기화',
  ORDER_NORMALIZE: '데이터 정제화',
  ERP_APPLY: 'ERP 반영',
}

function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType
}

function formatPeriod(frDt: string, toDt: string): string {
  if (!frDt || !toDt) return '-'
  const fmt = (d: string) => `${d.slice(4, 6)}/${d.slice(6, 8)}`
  return frDt === toDt ? fmt(frDt) : `${fmt(frDt)} ~ ${fmt(toDt)}`
}

function formatDateTime(iso: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function formatDetail(detail: string | null): string {
  if (!detail) return ''
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

function parseFailureInfo(errorMessage: string | null): FailureInfo | null {
  if (!errorMessage) return null

  const http = errorMessage.match(/HTTP\s+(\d{3})\s+([^:]+):?/i)
  if (http) {
    const status = Number(http[1])
    return {
      code: `HTTP ${status}`,
      label: http[2].trim(),
      retryable: status >= 500,
      reason: status >= 400 && status < 500 ? '재시도 제외' : '재시도 대상',
    }
  }

  const code = errorMessage.match(/\b(E[A-Z_]+|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ECONNABORTED|ENOTFOUND|EAI_AGAIN)\b/)
  if (code) {
    return {
      code: code[1],
      label: code[1].includes('TIME') || code[1] === 'ECONNABORTED' ? 'Timeout' : 'Network',
      retryable: true,
      reason: '재시도 대상',
    }
  }

  return {
    code: 'ERROR',
    label: 'Unknown',
    retryable: null,
    reason: '정책 확인 필요',
  }
}

export default function JobsPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const { isSystemAdmin } = useAuth()
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<JobsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [logRequestId, setLogRequestId] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        channelCd: channelFilter,
        page: String(page),
        size: String(PAGE_SIZE),
      })
      const res = await authenticatedFetch(`/api/hub/jobs?${params}`)
      if (!res.ok) throw new Error('작업 목록 조회 실패')
      setData(await res.json() as JobsResponse)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, statusFilter, channelFilter, page])

  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const id = setInterval(() => { void fetchJobs() }, 10_000)
    return () => clearInterval(id)
  }, [fetchJobs])

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value)
    setPage(1)
  }

  const handleRetry = async (requestId: string) => {
    try {
      const res = await authenticatedFetch(`/api/hub/jobs/${requestId}/retry`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('재시도 요청 실패')
      await fetchJobs()
    } catch (e) {
      console.error(e)
      alert('재시도 요청에 실패했습니다.')
    }
  }

  const jobs = data?.jobs ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <>
      {modalOpen && (
        <CollectRequestModal
          onClose={() => {
            setModalOpen(false)
            void fetchJobs()
          }}
        />
      )}
      {logRequestId && (
        <JobLogModal
          requestId={logRequestId}
          onClose={() => setLogRequestId(null)}
          canViewAttempts={isSystemAdmin}
        />
      )}
      <Layout
        title="작업 목록"
        actions={
          <>
            <select
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            >
              <option value="">전체 상태</option>
              <option>QUEUED</option>
              <option>PROCESSING</option>
              <option>SUCCESS</option>
              <option>FAILED</option>
            </select>
            <select
              value={channelFilter}
              onChange={handleFilterChange(setChannelFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            >
              <option value="">전체 채널</option>
              <option>11ST</option>
              <option>GCHAN</option>
              <option>COUPANG</option>
              <option>NSS</option>
              <option>MOCK_MALL</option>
            </select>
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-[#3182F6] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-600"
            >
              + 수집 요청
            </button>
          </>
        }
      >
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-[#FAFAFA]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">Request ID</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">작업</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">채널</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">수집 기간</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">상태</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">실패 원인</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">재시도</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">생성 시각</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">액션</th>
              </tr>
            </thead>
            <tbody>
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">
                    불러오는 중...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">
                    조건에 맞는 작업이 없습니다.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => {
                  const failure = parseFailureInfo(j.errorMessage)
                  return (
                    <tr key={j.requestId} className="border-t border-slate-50 transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-[11px] text-[#8B95A1]">
                        {j.requestId.slice(0, 8)}...
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-[12px] font-extrabold text-[#191F28]">{jobTypeLabel(j.jobType)}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-[#8B95A1]">{j.jobType}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold ${CHANNEL_COLORS[j.channelCd] ?? 'bg-slate-100 text-slate-600'}`}>
                          {j.channelCd}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#4E5968]">
                        {formatPeriod(j.frDt, j.toDt)}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                      <td className="px-5 py-3">
                        {j.status === 'FAILED' && failure ? (
                          <FailureBadge info={failure} message={j.errorMessage} />
                        ) : (
                          <span className="text-[12px] text-[#8B95A1]">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#8B95A1]">{j.retryCount}</td>
                      <td className="px-5 py-3 text-[13px] text-[#8B95A1]">
                        {formatDateTime(j.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLogRequestId(j.requestId)}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-[#4E5968] transition-colors hover:bg-slate-200"
                          >
                            로그
                          </button>
                          {j.status === 'FAILED' && (
                            <button
                              onClick={() => void handleRetry(j.requestId)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-[12px] font-bold text-[#FF6B6B] transition-colors hover:bg-red-100"
                            >
                              재시도
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <span className="text-[13px] text-[#8B95A1]">총 {totalCount.toLocaleString()}건</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-semibold text-[#4E5968] transition-colors hover:bg-slate-200 disabled:opacity-40"
              >
                이전
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p = startPage + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      p === page
                        ? 'bg-[#3182F6] text-white'
                        : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-semibold text-[#4E5968] transition-colors hover:bg-slate-200 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}

function FailureBadge({ info, message }: { info: FailureInfo; message: string | null }) {
  const cls = info.retryable === false
    ? 'bg-red-50 text-red-700'
    : info.retryable === true
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-600'

  return (
    <div className="max-w-[260px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${cls}`} title={message ?? undefined}>
          {info.code}
        </span>
        <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-[#4E5968]">
          {info.reason}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] font-semibold text-[#8B95A1]" title={message ?? undefined}>
        {info.label}
      </p>
    </div>
  )
}

function JobLogModal({ requestId, onClose, canViewAttempts }: { requestId: string; onClose: () => void; canViewAttempts: boolean }) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [logs, setLogs] = useState<JobLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchLogs() {
      setLoading(true)
      setError(null)
      try {
        const res = await authenticatedFetch(`/api/hub/jobs/${requestId}/logs`)
        if (!res.ok) throw new Error('로그 조회 실패')
        const body = await res.json() as JobLogsResponse
        if (mounted) setLogs(body.logs)
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : '로그 조회 중 오류가 발생했습니다.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void fetchLogs()
    return () => { mounted = false }
  }, [requestId, authenticatedFetch])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-h-[82vh] w-[920px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-[16px] font-extrabold text-[#191F28]">Job 로그</h2>
            <p className="mt-1 font-mono text-[11px] text-[#8B95A1]">{requestId}</p>
          </div>
          <button onClick={onClose} className="text-[22px] leading-none text-[#8B95A1] hover:text-[#4E5968]">x</button>
        </div>

        <div className="max-h-[calc(82vh-73px)] overflow-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-[13px] text-[#8B95A1]">로그를 불러오는 중...</div>
          ) : error ? (
            <div className="py-12 text-center text-[13px] text-red-500">{error}</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#8B95A1]">저장된 로그가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const failure = parseFailureInfo(log.errorMessage)
                const event = getJobOperationalEventPresentation(log.eventType, log.detail)
                return (
                  <div key={log.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${LOG_LEVEL_COLORS[log.level] ?? 'bg-slate-100 text-slate-600'}`}>
                            {log.level}
                          </span>
                          <span className="text-[12px] font-bold text-[#191F28]">{event.label}</span>
                          <span className="font-mono text-[10px] text-[#8B95A1]">{log.eventType}</span>
                          {event.category && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{event.category}</span>}
                          {failure && <FailureBadge info={failure} message={log.errorMessage} />}
                        </div>
                        <p className="mt-2 text-[13px] text-[#4E5968]">{log.message}</p>
                        {log.errorMessage && (
                          <p className="mt-2 break-words text-[12px] text-red-600">{log.errorMessage}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[12px] text-[#8B95A1]">{formatDateTime(log.createdAt)}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#8B95A1]">
                      {log.channelCd && <span className="rounded-md bg-slate-50 px-2 py-1">channel: {log.channelCd}</span>}
                      {log.mallKey && <span className="rounded-md bg-slate-50 px-2 py-1">mall: {log.mallKey}</span>}
                      {log.retryCount !== null && (
                        <span className="rounded-md bg-slate-50 px-2 py-1">retry: {log.retryCount}/{log.maxRetryCount ?? '-'}</span>
                      )}
                      {event.execution?.attemptId && <span className="rounded-md bg-slate-50 px-2 py-1">attempt: {event.execution.attemptId}</span>}
                      {event.execution?.workerId && <span className="rounded-md bg-slate-50 px-2 py-1">worker: {event.execution.workerId}</span>}
                      {event.execution?.fencingToken !== undefined && <span className="rounded-md bg-slate-50 px-2 py-1">token: {event.execution.fencingToken}</span>}
                    </div>

                    {log.detail && log.detail !== '{}' && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#4E5968]">
                        {formatDetail(log.detail)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {canViewAttempts && <JobAttemptPanel jobId={requestId} />}
        </div>
      </div>
    </div>,
    document.body
  )
}
