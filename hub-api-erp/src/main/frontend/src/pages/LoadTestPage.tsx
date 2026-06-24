import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type StartResponse = {
  runId: string
  scenario: string
  orders: number
  pageSize: number
  totalPages: number
  requestIds: string[]
}

type RunSummary = {
  runId: string
  scenario: string
  status: string
  totalRequested: number
  normalizedOrders: number
  elapsedMs: number
  ordersPerSecond: number
  jobsPerSecond: number
  p95DurationMs: number
  failedJobs: number
  startedAt: string
  completedAt?: string | null
}

type StatusResponse = {
  runId: string
  scenario: string
  runStatus: string
  elapsedMs: number
  ordersPerSecond: number
  jobsPerSecond: number
  throughputPerMinute: number
  avgDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  totalCollectJobs: number
  queuedCollectJobs: number
  processingCollectJobs: number
  successCollectJobs: number
  failedCollectJobs: number
  totalNormalizeJobs: number
  successNormalizeJobs: number
  failedNormalizeJobs: number
  normalizedOrders: number
  outbox: {
    total: number
    pending: number
    publishing: number
    sent: number
    failed: number
  }
  logs: Array<{
    createdAt: string
    requestId: string
    eventType: string
    level: string
    message: string
    errorMessage?: string | null
  }>
  recentRuns: RunSummary[]
}

type FormState = {
  orders: string
  pageSize: string
  seed: string
  scenario: string
  delayMs: string
  errorRate: string
  timeoutRate: string
}

const initialForm: FormState = {
  orders: '100000',
  pageSize: '100',
  seed: 'mock-load-test-ui-001',
  scenario: 'e2e-1p-1w',
  delayMs: '0',
  errorRate: '0',
  timeoutRate: '0',
}

export default function LoadTestPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [form, setForm] = useState<FormState>(initialForm)
  const [run, setRun] = useState<StartResponse | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [history, setHistory] = useState<RunSummary[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const collectPercent = useMemo(() => {
    if (!status || status.totalCollectJobs === 0) return 0
    return Math.round((status.successCollectJobs + status.failedCollectJobs) * 100 / status.totalCollectJobs)
  }, [status])

  const normalizePercent = useMemo(() => {
    if (!status || status.totalCollectJobs === 0) return 0
    return Math.round((status.successNormalizeJobs + status.failedNormalizeJobs) * 100 / status.totalCollectJobs)
  }, [status])

  const finished = Boolean(
    run &&
    status &&
    status.runStatus !== 'RUNNING'
  )

  const fetchHistory = useCallback(async () => {
    const response = await authenticatedFetch('/api/hub/load-tests')
    if (!response.ok) {
      throw new Error(`결과 이력 조회 실패 (${response.status})`)
    }
    const data = await response.json() as RunSummary[]
    setHistory(data)
  }, [authenticatedFetch])

  const fetchStatus = useCallback(async (runId: string) => {
    const response = await authenticatedFetch(`/api/hub/load-tests/${runId}`)
    if (!response.ok) {
      throw new Error(`상태 조회 실패 (${response.status})`)
    }
    const data = await response.json() as StatusResponse
    setStatus(data)
    setHistory(data.recentRuns)
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchHistory().catch((err) => {
      setError(err instanceof Error ? err.message : '결과 이력을 조회하지 못했습니다.')
    })
  }, [fetchHistory])

  useEffect(() => {
    if (!run || finished) return
    void fetchStatus(run.runId).catch((err) => {
      setError(err instanceof Error ? err.message : '상태를 조회하지 못했습니다.')
    })
    const id = setInterval(() => {
      void fetchStatus(run.runId).catch((err) => {
        setError(err instanceof Error ? err.message : '상태를 조회하지 못했습니다.')
      })
    }, 3000)
    return () => clearInterval(id)
  }, [fetchStatus, finished, run])

  function updateForm(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function startLoadTest() {
    setStarting(true)
    setError(null)
    setRun(null)
    setStatus(null)
    try {
      const response = await authenticatedFetch('/api/hub/load-tests/mock-mall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: Number(form.orders),
          pageSize: Number(form.pageSize),
          seed: form.seed,
          scenario: form.scenario,
          delayMs: Number(form.delayMs),
          errorRate: Number(form.errorRate),
          timeoutRate: Number(form.timeoutRate),
        }),
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`실행 요청 실패 (${response.status}) ${body}`)
      }
      const data = await response.json() as StartResponse
      setRun(data)
      await fetchStatus(data.runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '부하 테스트를 시작하지 못했습니다.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Layout title="대용량 데이터 테스트">
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <Field label="주문 수">
              <input value={form.orders} onChange={(e) => updateForm('orders', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Page size">
              <input value={form.pageSize} onChange={(e) => updateForm('pageSize', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Scenario">
              <input value={form.scenario} onChange={(e) => updateForm('scenario', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Seed">
              <input value={form.seed} onChange={(e) => updateForm('seed', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Delay ms">
              <input value={form.delayMs} onChange={(e) => updateForm('delayMs', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Error rate">
              <input value={form.errorRate} onChange={(e) => updateForm('errorRate', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Timeout rate">
              <input value={form.timeoutRate} onChange={(e) => updateForm('timeoutRate', e.target.value)} className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button
                onClick={() => void startLoadTest()}
                disabled={starting}
                className="h-10 w-full rounded-lg bg-[#3182F6] text-[13px] font-extrabold text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {starting ? '실행 요청 중' : '테스트 실행'}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
            {error}
          </div>
        )}

        {status && (
          <>
            <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Metric label="Run ID" value={status.runId} />
              <Metric label="상태" value={status.runStatus} />
              <Metric label="처리 주문 수" value={formatNumber(status.normalizedOrders)} />
              <Metric label="소요 시간" value={formatDuration(status.elapsedMs)} />
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Metric label="Orders/sec" value={formatDecimal(status.ordersPerSecond)} />
              <Metric label="Jobs/sec" value={formatDecimal(status.jobsPerSecond)} />
              <Metric label="P95 job ms" value={formatDecimal(status.p95DurationMs)} />
              <Metric label="실패 Job" value={formatNumber(status.failedCollectJobs + status.failedNormalizeJobs)} />
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProgressCard
                title="수집 진행률"
                percent={collectPercent}
                detail={`queued ${status.queuedCollectJobs} / processing ${status.processingCollectJobs} / failed ${status.failedCollectJobs}`}
              />
              <ProgressCard
                title="정규화 진행률"
                percent={normalizePercent}
                detail={`normalize jobs ${status.successNormalizeJobs}/${status.totalNormalizeJobs} / failed ${status.failedNormalizeJobs}`}
              />
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <Metric label="Outbox total" value={formatNumber(status.outbox.total)} />
              <Metric label="Outbox sent" value={formatNumber(status.outbox.sent)} />
              <Metric label="Outbox pending" value={formatNumber(status.outbox.pending)} />
              <Metric label="Outbox publishing" value={formatNumber(status.outbox.publishing)} />
              <Metric label="Outbox failed" value={formatNumber(status.outbox.failed)} />
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-900 bg-[#111827] shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-[13px] font-extrabold text-white">실행 로그</h2>
                <span className={`text-[12px] font-bold ${finished ? 'text-emerald-300' : 'text-blue-300'}`}>
                  {finished ? 'COMPLETED' : 'RUNNING'}
                </span>
              </div>
              <div className="max-h-[420px] overflow-auto p-4 font-mono text-[12px] leading-5 text-slate-200">
                {status.logs.length === 0 ? (
                  <p className="text-slate-400">로그 대기 중</p>
                ) : (
                  status.logs.map((log, index) => (
                    <div key={`${log.requestId}-${log.eventType}-${index}`} className="whitespace-pre-wrap">
                      <span className="text-slate-500">[{log.createdAt}]</span>{' '}
                      <span className={log.level === 'ERROR' ? 'text-red-300' : log.level === 'WARN' ? 'text-yellow-300' : 'text-emerald-300'}>
                        {log.level}
                      </span>{' '}
                      <span className="text-blue-300">{log.eventType}</span>{' '}
                      <span>{log.message}</span>
                      {log.errorMessage && <span className="text-red-300"> - {log.errorMessage}</span>}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        <section className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-[14px] font-extrabold text-[#191F28]">최근 e2e 결과 비교</h2>
            <button
              onClick={() => void fetchHistory()}
              className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-bold text-[#4E5968] hover:bg-slate-50"
            >
              새로고침
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-slate-50 text-[#8B95A1]">
                <tr>
                  <th className="px-4 py-3 font-extrabold">Scenario</th>
                  <th className="px-4 py-3 font-extrabold">Status</th>
                  <th className="px-4 py-3 font-extrabold">Orders</th>
                  <th className="px-4 py-3 font-extrabold">Normalized</th>
                  <th className="px-4 py-3 font-extrabold">Elapsed</th>
                  <th className="px-4 py-3 font-extrabold">Orders/sec</th>
                  <th className="px-4 py-3 font-extrabold">Jobs/sec</th>
                  <th className="px-4 py-3 font-extrabold">P95 ms</th>
                  <th className="px-4 py-3 font-extrabold">Failed</th>
                  <th className="px-4 py-3 font-extrabold">Started</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-[13px] font-semibold text-[#8B95A1]">
                      저장된 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.runId} className="border-t border-slate-50">
                      <td className="px-4 py-3 font-semibold text-[#191F28]">
                        <p>{item.scenario}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#8B95A1]">{item.runId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-[#4E5968]">{formatNumber(item.totalRequested)}</td>
                      <td className="px-4 py-3 text-[#4E5968]">{formatNumber(item.normalizedOrders)}</td>
                      <td className="px-4 py-3 text-[#4E5968]">{formatDuration(item.elapsedMs)}</td>
                      <td className="px-4 py-3 font-bold text-[#191F28]">{formatDecimal(item.ordersPerSecond)}</td>
                      <td className="px-4 py-3 text-[#4E5968]">{formatDecimal(item.jobsPerSecond)}</td>
                      <td className="px-4 py-3 text-[#4E5968]">{formatDecimal(item.p95DurationMs)}</td>
                      <td className={item.failedJobs > 0 ? 'px-4 py-3 font-bold text-red-600' : 'px-4 py-3 text-[#4E5968]'}>
                        {formatNumber(item.failedJobs)}
                      </td>
                      <td className="px-4 py-3 text-[#8B95A1]">{item.startedAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  )
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] text-[#191F28] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#4E5968]">{label}</span>
      {children}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-bold text-[#8B95A1]">{label}</p>
      <p className="mt-2 break-all text-[18px] font-extrabold text-[#191F28]">{value}</p>
    </div>
  )
}

function ProgressCard({ title, percent, detail }: { title: string; percent: number; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-extrabold text-[#191F28]">{title}</h2>
        <span className="text-[13px] font-extrabold text-[#3182F6]">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-[#3182F6] transition-all" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-3 text-[12px] font-semibold text-[#8B95A1]">{detail}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase()
  const cls = normalized === 'SUCCESS'
    ? 'bg-emerald-50 text-emerald-600'
    : normalized === 'FAILED'
      ? 'bg-red-50 text-red-600'
      : 'bg-blue-50 text-blue-600'

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-extrabold ${cls}`}>
      {normalized}
    </span>
  )
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function formatDecimal(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function formatDuration(ms: number) {
  if (ms <= 0) return '0s'
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes === 0) return `${remainSeconds}s`
  return `${minutes}m ${remainSeconds}s`
}
