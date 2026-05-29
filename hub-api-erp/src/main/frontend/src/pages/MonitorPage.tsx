import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type KafkaMonitorStats = {
  topicCount: number
  brokerCount: number
  partitionCount: number
  totalLag: number
}

type KafkaTopic = {
  name: string
  partitions: number
  replicas: number
  lag: number
  status: string
}

type KafkaBroker = {
  id: number
  host: string
  port: number
  rack: string | null
  status: string
}

type KafkaMonitorResponse = {
  stats: KafkaMonitorStats
  topics: KafkaTopic[]
  brokers: KafkaBroker[]
  consumerGroup: string
  status: string
  errorMessage: string | null
  generatedAt: string
}

type StatCard = {
  label: string
  value: string
  gradient: string
}

export default function MonitorPage() {
  const [data, setData] = useState<KafkaMonitorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const authenticatedFetch = useAuthenticatedFetch()

  const fetchMonitor = useCallback(async () => {
    setError('')
    try {
      const res = await authenticatedFetch('/api/hub/kafka/monitor')
      if (!res.ok) {
        throw new Error(`Kafka monitor API failed: ${res.status}`)
      }
      setData(await res.json() as KafkaMonitorResponse)
    } catch (err) {
      if ((err as Error).message !== 'Authentication required') {
        setError('Kafka 현황을 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    void fetchMonitor()
  }, [fetchMonitor])

  useEffect(() => {
    const id = setInterval(() => { void fetchMonitor() }, 10_000)
    return () => clearInterval(id)
  }, [fetchMonitor])

  const stats = useMemo<StatCard[]>(() => [
    {
      label: '토픽',
      value: formatNumber(data?.stats.topicCount ?? 0),
      gradient: 'from-[#3182F6] to-[#5BABF9]',
    },
    {
      label: '브로커',
      value: formatNumber(data?.stats.brokerCount ?? 0),
      gradient: 'from-[#00C073] to-[#3DDC97]',
    },
    {
      label: 'Consumer Lag',
      value: formatNumber(data?.stats.totalLag ?? 0),
      gradient: 'from-amber-400 to-yellow-300',
    },
  ], [data])

  return (
    <Layout
      title="Kafka 현황"
      actions={
        <button
          onClick={() => { setLoading(true); void fetchMonitor() }}
          className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
        >
          새로고침
        </button>
      }
    >
      {(error || data?.status === 'ERROR') && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
          {error || data?.errorMessage || 'Kafka 상태를 확인하지 못했습니다.'}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="text-[12px] text-[#8B95A1]">
          Consumer Group: <span className="font-mono font-semibold text-[#4E5968]">{data?.consumerGroup ?? '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#8B95A1]">
          <StatusPill status={data?.status ?? (loading ? 'LOADING' : 'UNKNOWN')} />
          <span>{data?.generatedAt ? formatDateTime(data.generatedAt) : '-'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.label} className={`bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`}>
            <p className="text-[12px] font-semibold opacity-85 mb-2">{s.label}</p>
            <p className="text-[28px] font-extrabold leading-none">{loading && !data ? '-' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">토픽</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">토픽명</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">파티션</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">복제</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Lag</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
              </tr>
            </thead>
            <tbody>
              {data?.topics.length ? data.topics.map((topic) => (
                <tr key={topic.name} className="border-t border-slate-50">
                  <td className="px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]">{topic.name}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{topic.partitions}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{topic.replicas}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{formatNumber(topic.lag)}</td>
                  <td className="px-5 py-3"><StatusPill status={topic.status} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                    {loading ? '불러오는 중입니다.' : '토픽 정보가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">브로커</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">ID</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Host</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Rack</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
              </tr>
            </thead>
            <tbody>
              {data?.brokers.length ? data.brokers.map((broker) => (
                <tr key={broker.id} className="border-t border-slate-50">
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{broker.id}</td>
                  <td className="px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]">{broker.host}:{broker.port}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{broker.rack ?? '-'}</td>
                  <td className="px-5 py-3"><StatusPill status={broker.status} /></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                    {loading ? '불러오는 중입니다.' : '브로커 정보가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase()
  const color = normalized === 'HEALTHY' || normalized === 'ONLINE'
    ? 'text-[#00C073] bg-[#E8FAF0]'
    : normalized === 'WARN'
      ? 'text-amber-600 bg-amber-50'
      : normalized === 'LOADING'
        ? 'text-[#3182F6] bg-blue-50'
        : 'text-red-600 bg-red-50'

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
