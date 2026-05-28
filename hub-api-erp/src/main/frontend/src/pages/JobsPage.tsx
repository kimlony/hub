import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import CollectRequestModal from '../components/CollectRequestModal'
import { useAuth } from '../context/AuthContext'

type Job = {
  requestId: string
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

const CHANNEL_COLORS: Record<string, string> = {
  '11ST': 'bg-red-50 text-red-600',
  GCHAN: 'bg-orange-50 text-orange-600',
  COUPANG: 'bg-rose-50 text-rose-700',
  NSS: 'bg-[#E8FAF0] text-[#00C073]',
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO: 'bg-blue-50 text-blue-700',
  WARN: 'bg-amber-50 text-amber-700',
  ERROR: 'bg-red-50 text-red-700',
}

const PAGE_SIZE = 20

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

export default function JobsPage() {
  const { token } = useAuth()
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
      const res = await fetch(`/api/hub/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('작업 목록 조회 실패')
      setData(await res.json() as JobsResponse)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [token, statusFilter, channelFilter, page])

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
      const res = await fetch(`/api/hub/jobs/${requestId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
          token={token}
          onClose={() => setLogRequestId(null)}
        />
      )}
      <Layout
        title="작업 목록"
        actions={
          <>
            <select
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
              className="px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
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
              className="px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            >
              <option value="">전체 채널</option>
              <option>11ST</option>
              <option>GCHAN</option>
              <option>COUPANG</option>
              <option>NSS</option>
            </select>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors"
            >
              + 수집 요청
            </button>
          </>
        }
      >
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-slate-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Request ID</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">채널</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">수집 기간</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">재시도</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">생성 시각</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">액션</th>
              </tr>
            </thead>
            <tbody>
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#8B95A1] text-[13px]">
                    불러오는 중...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#8B95A1] text-[13px]">
                    조건에 맞는 작업이 없습니다.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.requestId} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-[#8B95A1] text-[11px]">
                      {j.requestId.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${CHANNEL_COLORS[j.channelCd] ?? 'bg-slate-100 text-slate-600'}`}>
                        {j.channelCd}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-[#4E5968]">
                      {formatPeriod(j.frDt, j.toDt)}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-5 py-3 text-[13px] text-[#8B95A1]">{j.retryCount}</td>
                    <td className="px-5 py-3 text-[13px] text-[#8B95A1]">
                      {formatDateTime(j.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setLogRequestId(j.requestId)}
                          className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200 transition-colors"
                        >
                          LOG 보기
                        </button>
                        {j.status === 'FAILED' && (
                          <button
                            onClick={() => void handleRetry(j.requestId)}
                            className="px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-[#FF6B6B] hover:bg-red-100 transition-colors"
                          >
                            재시도
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <span className="text-[13px] text-[#8B95A1]">총 {totalCount}건</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors"
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
                    className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
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
                className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors"
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

function JobLogModal({ requestId, token, onClose }: { requestId: string; token: string | null; onClose: () => void }) {
  const [logs, setLogs] = useState<JobLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchLogs() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/hub/jobs/${requestId}/logs`, {
          headers: { Authorization: `Bearer ${token}` },
        })
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
  }, [requestId, token])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[920px] max-w-[calc(100vw-32px)] max-h-[82vh] bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[16px] font-extrabold text-[#191F28]">Job 로그</h2>
            <p className="mt-1 font-mono text-[11px] text-[#8B95A1]">{requestId}</p>
          </div>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-[22px] leading-none">x</button>
        </div>

        <div className="p-6 overflow-auto max-h-[calc(82vh-73px)]">
          {loading ? (
            <div className="py-12 text-center text-[13px] text-[#8B95A1]">로그를 불러오는 중...</div>
          ) : error ? (
            <div className="py-12 text-center text-[13px] text-red-500">{error}</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#8B95A1]">저장된 로그가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${LOG_LEVEL_COLORS[log.level] ?? 'bg-slate-100 text-slate-600'}`}>
                          {log.level}
                        </span>
                        <span className="font-mono text-[12px] font-bold text-[#191F28]">{log.eventType}</span>
                      </div>
                      <p className="mt-2 text-[13px] text-[#4E5968]">{log.message}</p>
                      {log.errorMessage && (
                        <p className="mt-2 text-[12px] text-red-600 break-words">{log.errorMessage}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[12px] text-[#8B95A1]">{formatDateTime(log.createdAt)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#8B95A1]">
                    {log.channelCd && <span className="px-2 py-1 rounded-lg bg-slate-50">channel: {log.channelCd}</span>}
                    {log.mallKey && <span className="px-2 py-1 rounded-lg bg-slate-50">mall: {log.mallKey}</span>}
                    {log.retryCount !== null && (
                      <span className="px-2 py-1 rounded-lg bg-slate-50">retry: {log.retryCount}/{log.maxRetryCount ?? '-'}</span>
                    )}
                  </div>

                  {log.detail && log.detail !== '{}' && (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#4E5968]">
                      {formatDetail(log.detail)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
