import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import CollectRequestModal from '../components/CollectRequestModal'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type DashboardStats = {
  todayTotal: number
  todaySuccess: number
  todayFailed: number
  queued: number
  processing: number
  retryWaiting: number
  todaySuccessRate: number
}

type RecentJob = {
  requestId: string
  channelCd: string
  frDt: string
  toDt: string
  status: string
  retryCount: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

type ChannelStat = {
  channelCd: string
  totalCount: number
  successCount: number
  failedCount: number
  processingCount: number
  queuedCount: number
}

type DashboardResponse = {
  stats: DashboardStats
  recentJobs: RecentJob[]
  channelStats: ChannelStat[]
  performance: PerformanceResponse
  workerPerformance: WorkerPerformanceItem[]
  loadTestRuns: LoadTestRunItem[]
  generatedAt: string
}

type ChannelNotice = {
  id: number
  channelCd: string
  severity: string
  status: string
  title: string
  message: string
  reason: string | null
  failureCount: number
  firstDetectedAt: string
  lastDetectedAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

type NoticeResponse = {
  notices: ChannelNotice[]
  generatedAt: string
}

type PerformanceSummary = {
  totalJobs: number
  completedJobs: number
  successJobs: number
  failedJobs: number
  avgDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  throughputPerMinute: number
}

type PerformancePoint = {
  bucket: string
  totalJobs: number
  completedJobs: number
  successJobs: number
  failedJobs: number
  avgDurationMs: number
  p95DurationMs: number
}

type PerformanceResponse = {
  minutes: number
  summary: PerformanceSummary
  points: PerformancePoint[]
  generatedAt: string
}

type LoadTestRunItem = {
  id: number
  runId: string
  mode: string
  totalRequested: number
  totalJobs: number
  completedJobs: number
  successJobs: number
  failedJobs: number
  elapsedMs: number
  throughputPerMinute: number
  avgDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  createdAt: string
}

type WorkerPerformanceItem = {
  workerInstanceId: string
  kafkaClientId: string
  source: string
  completedJobs: number
  successJobs: number
  failedJobs: number
  avgDurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  throughputPerMinute: number
  lastCompletedAt: string
}

type StatCard = {
  label: string
  value: string
  sub: string
  gradient: string
}

const channelMeta: Record<string, { label: string; initial: string; gradient: string }> = {
  '11ST': { label: '11번가', initial: '11', gradient: 'from-[#e8192c] to-[#ff6b6b]' },
  COUPANG: { label: '쿠팡', initial: 'C', gradient: 'from-[#ee2b2b] to-[#ff6060]' },
  GCHAN: { label: 'Gift Channel', initial: 'G', gradient: 'from-[#ff6f00] to-[#ffa040]' },
  NSS: { label: '네이버', initial: 'N', gradient: 'from-[#03c75a] to-[#3ddc97]' },
  GODO: { label: 'GODO', initial: 'GO', gradient: 'from-[#4f46e5] to-[#38bdf8]' },
}

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [notices, setNotices] = useState<ChannelNotice[]>([])
  const [performance, setPerformance] = useState<PerformanceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const authenticatedFetch = useAuthenticatedFetch()

  const fetchDashboard = useCallback(async () => {
    setError('')
    try {
      const [res, noticeRes] = await Promise.all([
        authenticatedFetch('/api/hub/jobs/dashboard'),
        authenticatedFetch('/api/hub/notices/active'),
      ])
      if (!res.ok) {
        throw new Error(`Dashboard API failed: ${res.status}`)
      }
      const dashboardBody = await res.json() as DashboardResponse
      setData(dashboardBody)
      setPerformance(dashboardBody.performance)
      if (noticeRes.ok) {
        const noticeBody = await noticeRes.json() as NoticeResponse
        setNotices(noticeBody.notices)
      }
    } catch (err) {
      if ((err as Error).message !== 'Authentication required') {
        setError('대시보드 데이터를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    const id = setInterval(() => { void fetchDashboard() }, 10_000)
    return () => clearInterval(id)
  }, [fetchDashboard])

  const statCards = useMemo<StatCard[]>(() => {
    const stats = data?.stats
    return [
      {
        label: '오늘 수집 요청',
        value: formatNumber(stats?.todayTotal ?? 0),
        sub: `성공률 ${formatRate(stats?.todaySuccessRate ?? 0)}`,
        gradient: 'from-[#3182F6] to-[#5BABF9]',
      },
      {
        label: '성공',
        value: formatNumber(stats?.todaySuccess ?? 0),
        sub: '오늘 완료된 작업',
        gradient: 'from-[#00C073] to-[#3DDC97]',
      },
      {
        label: '실패',
        value: formatNumber(stats?.todayFailed ?? 0),
        sub: `재시도 대기 ${formatNumber(stats?.retryWaiting ?? 0)}건`,
        gradient: 'from-[#FF6B6B] to-[#FF9A9A]',
      },
      {
        label: '처리 중',
        value: formatNumber((stats?.queued ?? 0) + (stats?.processing ?? 0)),
        sub: `QUEUED ${formatNumber(stats?.queued ?? 0)} · PROC ${formatNumber(stats?.processing ?? 0)}`,
        gradient: 'from-amber-400 to-yellow-300',
      },
    ]
  }, [data])

  const maxChannelCount = Math.max(...(data?.channelStats.map((ch) => ch.totalCount) ?? [0]), 1)
  const performancePoints = performance?.points ?? []

  return (
    <>
      {modalOpen && <CollectRequestModal onClose={() => setModalOpen(false)} />}
      <Layout
        title="대시보드"
        actions={
          <>
            <button
              onClick={() => { setLoading(true); void fetchDashboard() }}
              className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
            >
              새로고침
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors"
            >
              + 수집 요청
            </button>
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
            {error}
          </div>
        )}

        {notices.length > 0 && (
          <div className="mb-4 space-y-2">
            {notices.map((notice) => (
              <div key={notice.id} className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-extrabold text-amber-800">{notice.title}</p>
                    <p className="mt-1 text-[13px] font-medium text-amber-700">{notice.message}</p>
                    {notice.reason && (
                      <p className="mt-1 text-[11px] text-amber-600 line-clamp-1">{notice.reason}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    {notice.failureCount} failures
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4 mb-5">
          {statCards.map((s) => (
            <div key={s.label} className={`bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`}>
              <p className="text-[12px] font-semibold opacity-85 mb-2">{s.label}</p>
              <p className="text-[28px] font-extrabold leading-none">{loading && !data ? '-' : s.value}</p>
              <p className="text-[11px] opacity-80 mt-1.5">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[360px_1fr] gap-4 mb-5">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-[14px] font-extrabold text-[#191F28]">처리시간 지표</h3>
              <p className="mt-1 text-[12px] text-[#8B95A1]">최근 {performance?.minutes ?? 60}분 기준</p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5">
              <MetricBox label="평균" value={formatDuration(performance?.summary.avgDurationMs ?? 0)} />
              <MetricBox label="P95" value={formatDuration(performance?.summary.p95DurationMs ?? 0)} />
              <MetricBox label="최대" value={formatDuration(performance?.summary.maxDurationMs ?? 0)} />
              <MetricBox label="분당 완료" value={`${formatDecimal(performance?.summary.throughputPerMinute ?? 0)}/m`} />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <div>
                <h3 className="text-[14px] font-extrabold text-[#191F28]">처리량 / 지연시간 그래프</h3>
                <p className="mt-1 text-[12px] text-[#8B95A1]">완료 건수와 P95 처리시간을 함께 확인</p>
              </div>
              <div className="text-[12px] text-[#8B95A1]">
                완료 {formatNumber(performance?.summary.completedJobs ?? 0)} · 실패 {formatNumber(performance?.summary.failedJobs ?? 0)}
              </div>
            </div>
            <div className="p-5">
              <div className="h-[260px]">
                <LatencyLineChart points={performancePoints} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div>
              <h3 className="text-[14px] font-extrabold text-[#191F28]">Worker별 처리 성능</h3>
              <p className="mt-1 text-[12px] text-[#8B95A1]">최근 60분 기준으로 worker별 처리량과 지연시간 분포를 비교합니다.</p>
            </div>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-[12px] font-bold text-[#4E5968]">
              {formatNumber(data?.workerPerformance.length ?? 0)} workers
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="bg-[#FAFAFA]">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Worker</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Source</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Completed</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Success</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Failed</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Avg</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">P95</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Throughput</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Last</th>
                </tr>
              </thead>
              <tbody>
                {data?.workerPerformance.length ? data.workerPerformance.map((worker) => (
                  <tr key={`${worker.workerInstanceId}-${worker.source}`} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-2.5">
                      <p className="text-[12px] font-bold text-[#191F28]">{shortWorkerId(worker.workerInstanceId)}</p>
                      <p className="mt-0.5 text-[11px] text-[#8B95A1] line-clamp-1">{worker.kafkaClientId || worker.workerInstanceId}</p>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-[#4E5968]">
                        {worker.source}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-bold text-[#191F28]">{formatNumber(worker.completedJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-semibold text-[#00A661]">{formatNumber(worker.successJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-semibold text-[#E5484D]">{formatNumber(worker.failedJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-[#4E5968]">{formatDuration(worker.avgDurationMs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-bold text-[#F97316]">{formatDuration(worker.p95DurationMs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-[#4E5968]">{formatDecimal(worker.throughputPerMinute)}/m</td>
                    <td className="px-5 py-2.5 text-[12px] text-[#8B95A1]">{formatDateTime(worker.lastCompletedAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                      {loading ? '불러오는 중입니다.' : '최근 완료된 worker 처리 이력이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div>
              <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 부하테스트 리포트</h3>
              <p className="mt-1 text-[12px] text-[#8B95A1]">실행 조건과 처리 결과를 저장해서 테스트별 성능을 비교합니다.</p>
            </div>
            <span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-[12px] font-bold text-[#3182F6]">
              {formatNumber(data?.loadTestRuns.length ?? 0)} runs
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="bg-[#FAFAFA]">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Run</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Mode</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Jobs</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Success</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Failed</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Avg</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">P95</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Throughput</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Elapsed</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody>
                {data?.loadTestRuns.length ? data.loadTestRuns.map((run) => (
                  <tr key={run.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-2.5 text-[12px] font-bold text-[#191F28]">{run.runId}</td>
                    <td className="px-5 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-[#4E5968]">
                        {run.mode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-bold text-[#191F28]">{formatNumber(run.completedJobs)}/{formatNumber(run.totalJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-semibold text-[#00A661]">{formatNumber(run.successJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-semibold text-[#E5484D]">{formatNumber(run.failedJobs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-[#4E5968]">{formatDuration(run.avgDurationMs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] font-bold text-[#F97316]">{formatDuration(run.p95DurationMs)}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-[#4E5968]">{formatDecimal(run.throughputPerMinute)}/m</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-[#4E5968]">{formatDuration(run.elapsedMs)}</td>
                    <td className="px-5 py-2.5 text-[12px] text-[#8B95A1]">{formatDateTime(run.createdAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                      {loading ? '불러오는 중입니다.' : '아직 저장된 부하테스트 리포트가 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 작업</h3>
              <Link to="/jobs" className="text-[12px] text-[#3182F6] font-semibold hover:underline">
                전체 보기
              </Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-[#FAFAFA]">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">채널</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">기간</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">생성 시각</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentJobs.length ? data.recentJobs.map((job) => (
                  <tr key={job.requestId} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-2.5 text-[13px] font-bold text-[#191F28]">{job.channelCd}</td>
                    <td className="px-5 py-2.5 text-[12px] text-[#4E5968]">{formatPeriod(job.frDt, job.toDt)}</td>
                    <td className="px-5 py-2.5"><StatusBadge status={job.status} /></td>
                    <td className="px-5 py-2.5 text-[12px] text-[#8B95A1]">{formatDateTime(job.createdAt)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                      {loading ? '불러오는 중입니다.' : '아직 생성된 작업이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <h3 className="text-[14px] font-extrabold text-[#191F28]">채널별 수집 현황</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {data?.channelStats.length ? data.channelStats.map((ch) => {
                const meta = getChannelMeta(ch.channelCd)
                const pct = Math.max(4, Math.round((ch.totalCount / maxChannelCount) * 100))
                return (
                  <div key={ch.channelCd} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-9 h-9 bg-gradient-to-br ${meta.gradient} rounded-lg flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0`}>
                      {meta.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[13px] font-bold text-[#191F28] truncate">{meta.label}</span>
                        <span className="text-[13px] font-bold text-[#191F28] ml-2 flex-shrink-0">{formatNumber(ch.totalCount)}건</span>
                      </div>
                      <div className="h-1.5 bg-[#F2F4F6] rounded-full">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#5BABF9]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-[#8B95A1]">
                        성공 {formatNumber(ch.successCount)} · 실패 {formatNumber(ch.failedCount)} · 진행 {formatNumber(ch.processingCount + ch.queuedCount)}
                      </p>
                    </div>
                  </div>
                )
              }) : (
                <div className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                  {loading ? '불러오는 중입니다.' : '채널별 수집 데이터가 없습니다.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}

function getChannelMeta(channelCd: string) {
  return channelMeta[channelCd] ?? {
    label: channelCd,
    initial: channelCd.slice(0, 2).toUpperCase(),
    gradient: 'from-slate-500 to-slate-400',
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDecimal(value: number): string {
  return value.toFixed(1)
}

function formatDuration(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }
  return `${Math.round(value)}ms`
}

function formatPeriod(frDt: string, toDt: string): string {
  if (!frDt && !toDt) {
    return '-'
  }
  return `${formatDate(frDt)} ~ ${formatDate(toDt)}`
}

function formatDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(4, 6)}/${value.slice(6, 8)}`
  }
  return value || '-'
}

function formatDateTime(value: string): string {
  if (!value) {
    return '-'
  }
  return value.replace('T', ' ').slice(0, 16)
}

function shortWorkerId(value: string): string {
  if (!value || value === 'unknown') {
    return 'unknown'
  }
  const parts = value.split(':')
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#8B95A1]">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold text-[#191F28]">{value}</p>
    </div>
  )
}

function LatencyLineChart({ points }: { points: PerformancePoint[] }) {
  if (!points.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-[#FAFAFA] text-[13px] text-[#8B95A1]">
        처리시간 데이터가 없습니다.
      </div>
    )
  }

  const width = 860
  const height = 260
  const paddingLeft = 54
  const paddingRight = 54
  const paddingTop = 28
  const paddingBottom = 38
  const innerWidth = width - paddingLeft - paddingRight
  const innerHeight = height - paddingTop - paddingBottom
  const maxLatency = Math.max(...points.map((point) => point.p95DurationMs), 1)
  const maxCompleted = Math.max(...points.map((point) => point.completedJobs), 1)
  const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth
  const barWidth = Math.max(10, Math.min(34, innerWidth / points.length * 0.52))
  const path = points.map((point, index) => {
    const x = paddingLeft + index * step
    const y = paddingTop + innerHeight - (point.p95DurationMs / maxLatency) * innerHeight
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const avgLatency = points.reduce((sum, point) => sum + point.avgDurationMs, 0) / points.length
  const avgY = paddingTop + innerHeight - (avgLatency / maxLatency) * innerHeight
  const gridTicks = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="completedBars" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3182F6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="latencyArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridTicks.map((tick) => {
        const y = paddingTop + innerHeight - tick * innerHeight
        return (
          <g key={tick}>
            <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#EDF2F7" strokeWidth="1" />
            <text x={paddingLeft - 10} y={y + 4} textAnchor="end" fill="#8B95A1" fontSize="10">
              {formatDuration(maxLatency * tick)}
            </text>
          </g>
        )
      })}

      {points.map((point, index) => {
        const x = paddingLeft + index * step
        const barHeight = (point.completedJobs / maxCompleted) * innerHeight
        return (
          <rect
            key={`bar-${point.bucket}`}
            x={x - barWidth / 2}
            y={paddingTop + innerHeight - barHeight}
            width={barWidth}
            height={barHeight}
            rx="4"
            fill="url(#completedBars)"
          />
        )
      })}

      <path
        d={`${path} L ${paddingLeft + (points.length - 1) * step} ${paddingTop + innerHeight} L ${paddingLeft} ${paddingTop + innerHeight} Z`}
        fill="url(#latencyArea)"
      />
      <line
        x1={paddingLeft}
        y1={avgY}
        x2={width - paddingRight}
        y2={avgY}
        stroke="#F97316"
        strokeDasharray="5 5"
        strokeWidth="1.5"
      />
      <path d={path} fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const x = paddingLeft + index * step
        const y = paddingTop + innerHeight - (point.p95DurationMs / maxLatency) * innerHeight
        return (
          <g key={`${point.bucket}-${index}`}>
            <circle cx={x} cy={y} r="4.5" fill="#FFF7ED" stroke="#F97316" strokeWidth="2.5" />
            {index === points.length - 1 && (
              <text x={Math.min(width - 112, x + 10)} y={Math.max(14, y - 10)} fill="#9A3412" fontSize="12" fontWeight="800">
                P95 {formatDuration(point.p95DurationMs)}
              </text>
            )}
            {index % labelEvery === 0 && (
              <text x={x} y={height - 12} textAnchor="middle" fill="#8B95A1" fontSize="10">
                {point.bucket}
              </text>
            )}
          </g>
        )
      })}

      <line x1={paddingLeft} y1={paddingTop + innerHeight} x2={width - paddingRight} y2={paddingTop + innerHeight} stroke="#DDE3EA" strokeWidth="1" />
      <text x={paddingLeft} y={18} fill="#4E5968" fontSize="11" fontWeight="800">P95 처리시간</text>
      <text x={width - paddingRight} y={18} textAnchor="end" fill="#4E5968" fontSize="11" fontWeight="800">완료 건수</text>
      <circle cx={paddingLeft + 78} cy={14} r="4" fill="#F97316" />
      <rect x={width - paddingRight - 72} y="8" width="10" height="10" rx="2" fill="#3182F6" />
    </svg>
  )
}
