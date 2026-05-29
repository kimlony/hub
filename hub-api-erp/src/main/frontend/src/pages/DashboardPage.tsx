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

type StatCard = {
  label: string
  value: string
  sub: string
  gradient: string
}

const channelMeta: Record<string, { label: string; initial: string; gradient: string }> = {
  '11ST': { label: '11번가', initial: '11', gradient: 'from-[#e8192c] to-[#ff6b6b]' },
  COUPANG: { label: '쿠팡', initial: 'C', gradient: 'from-[#ee2b2b] to-[#ff6060]' },
  GCHAN: { label: '선물찬스', initial: 'G', gradient: 'from-[#ff6f00] to-[#ffa040]' },
  NSS: { label: '네이버', initial: 'N', gradient: 'from-[#03c75a] to-[#3ddc97]' },
  GODO: { label: 'GODO', initial: 'GO', gradient: 'from-[#4f46e5] to-[#38bdf8]' },
}

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [notices, setNotices] = useState<ChannelNotice[]>([])
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
      setData(await res.json() as DashboardResponse)
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
