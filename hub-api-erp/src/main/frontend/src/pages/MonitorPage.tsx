import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type KafkaMonitorStats = {
  topicCount: number
  brokerCount: number
  partitionCount: number
  totalLag: number
}

type KafkaPartition = {
  topic: string
  partition: number
  leader: number
  replicas: number[]
  latestOffset: number
  committedOffset: number
  lag: number
  consumerId: string | null
  clientId: string | null
  host: string | null
  status: string
}

type KafkaTopic = {
  name: string
  partitions: number
  replicas: number
  lag: number
  status: string
  partitionDetails: KafkaPartition[]
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

type WorkerStatusStats = {
  totalCount: number
  onlineCount: number
  staleCount: number
  stoppedCount: number
}

type WorkerStatusItem = {
  workerId: string
  role: string
  pid: number
  hostname: string
  status: string
  startedAt: string
  lastSeenAt: string
  heartbeatIntervalSeconds: number
  secondsSinceSeen: number
  metadata: string
}

type WorkerStatusResponse = {
  stats: WorkerStatusStats
  workers: WorkerStatusItem[]
  generatedAt: string
}

type KafkaJobDistributionSummary = {
  partition: number
  jobCount: number
  workerInstanceIds: string[]
  kafkaClientIds: string[]
  channels: string[]
}

type KafkaJobDistributionItem = {
  requestId: string
  channelCd: string
  partition: number
  offset: string
  messageKey: string
  kafkaMessageId: string
  workerInstanceId: string
  kafkaClientId: string
  createdAt: string
}

type KafkaJobDistributionResponse = {
  minutes: number
  summary: KafkaJobDistributionSummary[]
  recentJobs: KafkaJobDistributionItem[]
  recentPage: number
  recentSize: number
  recentTotal: number
  generatedAt: string
}

type KafkaDlqMessageItem = {
  key: string | null
  partition: number
  offset: number
  createdAt: string
  failedAt: string
  source: string
  errorMessage: string
  retryCount: number
  maxRetryCount: number
  requestId: string
  jobType: string
  requestKey: string
  channelCd: string
  payload: string
  rawMessage: string
}

type KafkaDlqMessageResponse = {
  topic: string
  total: number
  messages: KafkaDlqMessageItem[]
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
  const [workerData, setWorkerData] = useState<WorkerStatusResponse | null>(null)
  const [distributionData, setDistributionData] = useState<KafkaJobDistributionResponse | null>(null)
  const [dlqData, setDlqData] = useState<KafkaDlqMessageResponse | null>(null)
  const [recentJobPage, setRecentJobPage] = useState(1)
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

      const workerRes = await authenticatedFetch('/api/hub/workers/status')
      if (!workerRes.ok) {
        throw new Error(`Worker status API failed: ${workerRes.status}`)
      }
      setWorkerData(await workerRes.json() as WorkerStatusResponse)

      const distributionRes = await authenticatedFetch(`/api/hub/kafka/job-distribution?minutes=60&page=${recentJobPage}&size=10`)
      if (!distributionRes.ok) {
        throw new Error(`Kafka job distribution API failed: ${distributionRes.status}`)
      }
      setDistributionData(await distributionRes.json() as KafkaJobDistributionResponse)

      const dlqRes = await authenticatedFetch('/api/hub/kafka/dlq?limit=20')
      if (!dlqRes.ok) {
        throw new Error(`Kafka DLQ API failed: ${dlqRes.status}`)
      }
      setDlqData(await dlqRes.json() as KafkaDlqMessageResponse)
    } catch (err) {
      if ((err as Error).message !== 'Authentication required') {
        setError('모니터링 데이터를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, recentJobPage])

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
    {
      label: 'Worker Online',
      value: `${formatNumber(workerData?.stats.onlineCount ?? 0)} / ${formatNumber(workerData?.stats.totalCount ?? 0)}`,
      gradient: 'from-[#64748B] to-[#94A3B8]',
    },
  ], [data, workerData])

  const partitions = useMemo(
    () => data?.topics.flatMap((topic) => topic.partitionDetails) ?? [],
    [data]
  )
  const maxDistributionCount = Math.max(
    ...(distributionData?.summary.map((item) => item.jobCount) ?? [0]),
    1
  )
  const recentJobPageCount = Math.max(
    1,
    Math.ceil((distributionData?.recentTotal ?? 0) / (distributionData?.recentSize ?? 10))
  )

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

      <div className="grid grid-cols-4 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.label} className={`bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`}>
            <p className="text-[12px] font-semibold opacity-85 mb-2">{s.label}</p>
            <p className="text-[28px] font-extrabold leading-none">{loading && !data ? '-' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
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

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">파티션 상세</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Topic</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Partition</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Leader</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Latest</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Committed</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Lag</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Consumer</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
            </tr>
          </thead>
          <tbody>
            {partitions.length ? partitions.map((partition) => (
              <tr key={`${partition.topic}-${partition.partition}`} className="border-t border-slate-50">
                <td className="px-5 py-3 font-mono text-[12px] font-semibold text-[#191F28]">{partition.topic}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{partition.partition}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{partition.leader}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{formatNumber(partition.latestOffset)}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{formatNumber(partition.committedOffset)}</td>
                <td className="px-5 py-3 text-[13px] font-bold text-[#191F28]">{formatNumber(partition.lag)}</td>
                <td className="px-5 py-3 text-[12px] text-[#4E5968]">
                  {partition.consumerId ? (
                    <div className="max-w-[280px]">
                      <p className="truncate font-mono font-semibold">{partition.clientId ?? partition.consumerId}</p>
                      <p className="truncate text-[#8B95A1]">{partition.host ?? '-'}</p>
                    </div>
                  ) : (
                    <span className="text-[#8B95A1]">unassigned</span>
                  )}
                </td>
                <td className="px-5 py-3"><StatusPill status={partition.status} /></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                  {loading ? '불러오는 중입니다.' : '파티션 상세 정보가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div>
            <h3 className="text-[14px] font-extrabold text-[#191F28]">DLQ 실패 메시지</h3>
            <p className="mt-1 text-[12px] text-[#8B95A1]">
              {dlqData?.topic ?? 'hub.jobs.dlq'} · 최근 {formatNumber(dlqData?.total ?? 0)}건
            </p>
          </div>
          <StatusPill status={dlqData?.status ?? (loading ? 'LOADING' : 'UNKNOWN')} />
        </div>
        {dlqData?.status === 'ERROR' && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-[12px] font-semibold text-red-600">
            {dlqData.errorMessage || 'DLQ 메시지를 불러오지 못했습니다.'}
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Job</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Channel</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Error</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Retry</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Kafka</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Failed At</th>
            </tr>
          </thead>
          <tbody>
            {dlqData?.messages.length ? dlqData.messages.map((message) => (
              <tr key={`${message.partition}-${message.offset}`} className="border-t border-slate-50 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <p className="font-mono text-[12px] font-semibold text-[#191F28]" title={message.requestId}>
                    {message.requestId ? `${message.requestId.slice(0, 8)}...` : '-'}
                  </p>
                  <p className="mt-1 max-w-[240px] truncate text-[11px] text-[#8B95A1]" title={message.requestKey}>
                    {message.jobType || '-'} · {message.requestKey || '-'}
                  </p>
                </td>
                <td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{message.channelCd || '-'}</td>
                <td className="px-5 py-3">
                  <p className="max-w-[520px] truncate text-[13px] font-semibold text-red-600" title={message.errorMessage}>
                    {message.errorMessage || '-'}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8B95A1]">{message.source || '-'}</p>
                </td>
                <td className="px-5 py-3 text-[13px] font-bold text-[#191F28]">
                  {formatNumber(message.retryCount)} / {formatNumber(message.maxRetryCount)}
                </td>
                <td className="px-5 py-3">
                  <p className="font-mono text-[12px] font-semibold text-[#4E5968]">
                    P{message.partition} · O{message.offset}
                  </p>
                  <p className="mt-1 max-w-[180px] truncate text-[11px] text-[#8B95A1]" title={message.key ?? ''}>
                    {message.key || '-'}
                  </p>
                </td>
                <td className="px-5 py-3 text-[12px] text-[#8B95A1]">
                  <div>{formatDateTime(message.failedAt || message.createdAt)}</div>
                  <div className="mt-1">{message.createdAt}</div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">
                  {loading ? '불러오는 중입니다.' : 'DLQ에 보관된 실패 메시지가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-[420px_1fr] gap-4">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">Kafka Job 분포</h3>
            <span className="text-[12px] text-[#8B95A1]">최근 {distributionData?.minutes ?? 60}분</span>
          </div>
          <div className="divide-y divide-slate-50">
            {distributionData?.summary.length ? distributionData.summary.map((item) => {
              const pct = Math.max(4, Math.round((item.jobCount / maxDistributionCount) * 100))
              return (
                <div key={item.partition} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-extrabold text-[#191F28]">Partition {item.partition}</p>
                      <p className="mt-1 max-w-[280px] truncate text-[11px] text-[#8B95A1]">
                        {joinList(item.kafkaClientIds) || joinList(item.workerInstanceIds) || 'worker 없음'}
                      </p>
                    </div>
                    <span className="text-[18px] font-extrabold text-[#191F28]">{formatNumber(item.jobCount)}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-[#F2F4F6]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#5BABF9]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[#8B95A1]">{joinList(item.channels) || '-'}</p>
                </div>
              )
            }) : (
              <div className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">
                최근 Kafka 수신 로그가 없습니다.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <div>
              <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 Kafka Job 추적</h3>
              <p className="mt-1 text-[12px] text-[#8B95A1]">
                총 {formatNumber(distributionData?.recentTotal ?? 0)}건 · {formatNumber(distributionData?.recentPage ?? recentJobPage)} / {formatNumber(recentJobPageCount)} 페이지
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecentJobPage((page) => Math.max(1, page - 1))}
                disabled={recentJobPage <= 1}
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-[#F2F4F6] text-[#4E5968] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => setRecentJobPage((page) => Math.min(recentJobPageCount, page + 1))}
                disabled={recentJobPage >= recentJobPageCount}
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-[#F2F4F6] text-[#4E5968] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
              >
                다음
              </button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Job</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Channel</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Partition</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Offset</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Worker</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Time</th>
              </tr>
            </thead>
            <tbody>
              {distributionData?.recentJobs.length ? distributionData.recentJobs.map((job) => (
                <tr key={`${job.requestId}-${job.kafkaMessageId}`} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-mono text-[12px] font-semibold text-[#191F28]">{job.requestId.slice(0, 8)}...</p>
                    <p className="mt-1 max-w-[220px] truncate text-[11px] text-[#8B95A1]" title={job.messageKey}>{job.messageKey}</p>
                  </td>
                  <td className="px-5 py-3 text-[13px] font-bold text-[#4E5968]">{job.channelCd}</td>
                  <td className="px-5 py-3 text-[13px] font-bold text-[#191F28]">{job.partition}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{job.offset}</td>
                  <td className="px-5 py-3">
                    <p className="max-w-[220px] truncate font-mono text-[12px] font-semibold text-[#4E5968]" title={job.kafkaClientId}>
                      {job.kafkaClientId || job.workerInstanceId}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8B95A1]">{job.workerInstanceId}</p>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[#8B95A1]">{job.createdAt}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#8B95A1]">
                    최근 Kafka Job 추적 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">Worker 상태</h3>
          <div className="text-[12px] text-[#8B95A1]">
            Online {formatNumber(workerData?.stats.onlineCount ?? 0)} · Stale {formatNumber(workerData?.stats.staleCount ?? 0)} · Stopped {formatNumber(workerData?.stats.stoppedCount ?? 0)}
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Worker</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Role</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">PID</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Host</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Last Seen</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Interval</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
            </tr>
          </thead>
          <tbody>
            {workerData?.workers.length ? workerData.workers.map((worker) => (
              <tr key={worker.workerId} className="border-t border-slate-50">
                <td className="px-5 py-3 font-mono text-[12px] font-semibold text-[#191F28]">{worker.workerId}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{worker.role}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{worker.pid}</td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{worker.hostname}</td>
                <td className="px-5 py-3 text-[12px] text-[#4E5968]">
                  <div>{worker.lastSeenAt}</div>
                  <div className="text-[#8B95A1]">{formatNumber(worker.secondsSinceSeen)}초 전</div>
                </td>
                <td className="px-5 py-3 text-[13px] text-[#4E5968]">{worker.heartbeatIntervalSeconds}s</td>
                <td className="px-5 py-3"><StatusPill status={worker.status} /></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
                  {loading ? '불러오는 중입니다.' : 'Worker heartbeat 데이터가 없습니다.'}
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
  const color = normalized === 'HEALTHY' || normalized === 'ONLINE'
    ? 'text-[#00C073] bg-[#E8FAF0]'
    : normalized === 'WARN'
      ? 'text-amber-600 bg-amber-50'
      : normalized === 'STALE'
        ? 'text-amber-700 bg-amber-50'
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

function joinList(values: string[]): string {
  return values.filter(Boolean).join(', ')
}
