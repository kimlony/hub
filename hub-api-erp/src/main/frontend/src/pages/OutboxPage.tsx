import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type OutboxStats = {
  total: number
  pending: number
  publishing: number
  sent: number
  failed: number
  stale: number
}

type OutboxEvent = {
  id: number
  requestId: string
  eventType: string
  topic: string
  partitionKey: string
  status: string
  retryCount: number
  maxRetryCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  nextRetryAt: string
  lockedAt: string | null
  publishedAt: string | null
}

type OutboxMonitorResponse = {
  stats: OutboxStats
  events: OutboxEvent[]
  status: string
  generatedAt: string
}

const STATUS_OPTIONS = ['', 'PENDING', 'PUBLISHING', 'SENT', 'FAILED']

export default function OutboxPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [statusFilter, setStatusFilter] = useState('')
  const [data, setData] = useState<OutboxMonitorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchOutbox = useCallback(async () => {
    setError('')
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (statusFilter) {
        params.set('status', statusFilter)
      }
      const res = await authenticatedFetch(`/api/hub/outbox/monitor?${params}`)
      if (!res.ok) {
        throw new Error(`Outbox monitor API failed: ${res.status}`)
      }
      setData(await res.json() as OutboxMonitorResponse)
    } catch (err) {
      if ((err as Error).message !== 'Authentication required') {
        setError('Outbox 상태를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, statusFilter])

  useEffect(() => {
    void fetchOutbox()
  }, [fetchOutbox])

  useEffect(() => {
    const id = setInterval(() => { void fetchOutbox() }, 10_000)
    return () => clearInterval(id)
  }, [fetchOutbox])

  const cards = useMemo(() => {
    const stats = data?.stats
    return [
      { label: '전체', value: stats?.total ?? 0, color: 'bg-[#3182F6] text-white' },
      { label: '대기', value: stats?.pending ?? 0, color: 'bg-blue-50 text-[#3182F6]' },
      { label: '발행 중', value: stats?.publishing ?? 0, color: 'bg-amber-50 text-amber-700' },
      { label: '완료', value: stats?.sent ?? 0, color: 'bg-[#E8FAF0] text-[#00C073]' },
      { label: '실패', value: stats?.failed ?? 0, color: 'bg-red-50 text-red-600' },
      { label: '멈춤 감지', value: stats?.stale ?? 0, color: 'bg-slate-100 text-[#4E5968]' },
    ]
  }, [data])

  return (
    <Layout
      title="Outbox 모니터링"
      actions={
        <>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status || 'ALL'} value={status}>
                {status || '전체 상태'}
              </option>
            ))}
          </select>
          <button
            onClick={() => { setLoading(true); void fetchOutbox() }}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
          >
            새로고침
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] text-[#8B95A1]">
          Kafka 발행 대기 이벤트와 stuck PUBLISHING 이벤트를 확인합니다.
        </p>
        <p className="text-[12px] text-[#8B95A1]">
          {data?.generatedAt ? formatDateTime(data.generatedAt) : '-'}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-6 gap-3">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-lg p-4 ${card.color}`}>
            <p className="text-[12px] font-bold opacity-80">{card.label}</p>
            <p className="mt-2 text-[26px] font-extrabold leading-none">
              {loading && !data ? '-' : formatNumber(card.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div>
            <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 Outbox 이벤트</h3>
            <p className="mt-1 text-[12px] text-[#8B95A1]">
              Kafka 발행 상태를 DB 기준으로 추적합니다.
            </p>
          </div>
          <StatusPill status={data?.status ?? (loading ? 'LOADING' : 'UNKNOWN')} />
        </div>

        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">ID</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Event</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Topic / Key</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Status</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Retry</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Time</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Error</th>
            </tr>
          </thead>
          <tbody>
            {data?.events.length ? data.events.map((event) => (
              <tr key={event.id} className="border-t border-slate-50 hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-[12px] font-bold text-[#191F28]">
                  {event.id}
                </td>
                <td className="px-5 py-3">
                  <p className="text-[13px] font-bold text-[#191F28]">{event.eventType}</p>
                  <p className="mt-1 max-w-[180px] truncate font-mono text-[11px] text-[#8B95A1]" title={event.requestId}>
                    {event.requestId}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <p className="font-mono text-[12px] font-semibold text-[#4E5968]">{event.topic}</p>
                  <p className="mt-1 max-w-[260px] truncate font-mono text-[11px] text-[#8B95A1]" title={event.partitionKey}>
                    {event.partitionKey}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={event.status} />
                </td>
                <td className="px-5 py-3 text-[13px] font-bold text-[#191F28]">
                  {formatNumber(event.retryCount)} / {formatNumber(event.maxRetryCount)}
                </td>
                <td className="px-5 py-3 text-[12px] text-[#4E5968]">
                  <div>생성 {event.createdAt || '-'}</div>
                  <div className="mt-1 text-[#8B95A1]">발행 {event.publishedAt || '-'}</div>
                  {event.lockedAt && (
                    <div className="mt-1 text-[#8B95A1]">Lock {event.lockedAt}</div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <p className="max-w-[360px] truncate text-[12px] font-semibold text-red-600" title={event.lastError ?? ''}>
                    {event.lastError || '-'}
                  </p>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">
                  {loading ? '불러오는 중입니다.' : 'Outbox 이벤트가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase()
  const color = normalized === 'SENT' || normalized === 'HEALTHY'
    ? 'text-[#00C073] bg-[#E8FAF0]'
    : normalized === 'PENDING' || normalized === 'PUBLISHING' || normalized === 'LOADING'
      ? 'text-amber-700 bg-amber-50'
      : normalized === 'FAILED'
        ? 'text-red-600 bg-red-50'
        : 'text-[#4E5968] bg-slate-100'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${color}`}>
      <span className="w-2 h-2 rounded-full bg-current inline-block" />
      {status}
    </span>
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatDateTime(value: string): string {
  if (!value) {
    return '-'
  }
  return value.replace('T', ' ').slice(0, 19)
}
