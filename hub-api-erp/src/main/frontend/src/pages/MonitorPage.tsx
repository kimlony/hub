import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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

type FailureInfo = {
  code: string
  label: string
  retryable: boolean | null
  reason: string
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
  const [replayingKey, setReplayingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const authenticatedFetch = useAuthenticatedFetch()

  const fetchMonitor = useCallback(async () => {
    setError('')
    try {
      const res = await authenticatedFetch('/api/hub/kafka/monitor')
      if (!res.ok) throw new Error(`Kafka monitor API failed: ${res.status}`)
      setData(await res.json() as KafkaMonitorResponse)

      const workerRes = await authenticatedFetch('/api/hub/workers/status')
      if (!workerRes.ok) throw new Error(`Worker status API failed: ${workerRes.status}`)
      setWorkerData(await workerRes.json() as WorkerStatusResponse)

      const distributionRes = await authenticatedFetch(`/api/hub/kafka/job-distribution?minutes=60&page=${recentJobPage}&size=10`)
      if (!distributionRes.ok) throw new Error(`Kafka job distribution API failed: ${distributionRes.status}`)
      setDistributionData(await distributionRes.json() as KafkaJobDistributionResponse)

      const dlqRes = await authenticatedFetch('/api/hub/kafka/dlq?limit=20')
      if (!dlqRes.ok) throw new Error(`Kafka DLQ API failed: ${dlqRes.status}`)
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

  async function replayDlqMessage(message: KafkaDlqMessageItem) {
    const replayKey = `${message.partition}-${message.offset}`
    const ok = window.confirm(`${message.requestId || 'DLQ 메시지'}를 jobs topic으로 재처리할까요?`)
    if (!ok) return

    setReplayingKey(replayKey)
    try {
      const response = await authenticatedFetch('/api/hub/kafka/dlq/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawMessage: message.rawMessage }),
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `DLQ replay failed: ${response.status}`)
      }
      await fetchMonitor()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'DLQ 재처리에 실패했습니다.')
    } finally {
      setReplayingKey(null)
    }
  }

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
          className="rounded-lg bg-[#F2F4F6] px-4 py-2 text-[13px] font-semibold text-[#4E5968] transition-colors hover:bg-slate-200"
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

      <div className="mb-5 grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-lg bg-gradient-to-br ${s.gradient} p-5 text-white`}>
            <p className="mb-2 text-[12px] font-semibold opacity-85">{s.label}</p>
            <p className="text-[28px] font-extrabold leading-none">{loading && !data ? '-' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <section className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-50 px-5 py-4">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">토픽</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <TableHead>토픽명</TableHead>
                <TableHead>파티션</TableHead>
                <TableHead>복제</TableHead>
                <TableHead>Lag</TableHead>
                <TableHead>상태</TableHead>
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
                <EmptyRow colSpan={5} loading={loading} text="토픽 정보가 없습니다." />
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-50 px-5 py-4">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">브로커</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <TableHead>ID</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead>상태</TableHead>
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
                <EmptyRow colSpan={4} loading={loading} text="브로커 정보가 없습니다." />
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-50 px-5 py-4">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">파티션 상세</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <TableHead>Topic</TableHead>
              <TableHead>Partition</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Latest</TableHead>
              <TableHead>Committed</TableHead>
              <TableHead>Lag</TableHead>
              <TableHead>Consumer</TableHead>
              <TableHead>상태</TableHead>
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
              <EmptyRow colSpan={8} loading={loading} text="파티션 상세 정보가 없습니다." />
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
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
              <TableHead>Job</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Retry</TableHead>
              <TableHead>Kafka</TableHead>
              <TableHead>Failed At</TableHead>
              <TableHead>Action</TableHead>
            </tr>
          </thead>
          <tbody>
            {dlqData?.messages.length ? dlqData.messages.map((message) => {
              const failure = parseFailureInfo(message.errorMessage)
              const replayKey = `${message.partition}-${message.offset}`
              return (
                <tr key={replayKey} className="border-t border-slate-50 hover:bg-slate-50">
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
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {failure && <FailureBadge info={failure} message={message.errorMessage} />}
                      <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-[#8B95A1]">
                        {message.source || '-'}
                      </span>
                    </div>
                    <p className="max-w-[520px] truncate text-[13px] font-semibold text-red-600" title={message.errorMessage}>
                      {message.errorMessage || '-'}
                    </p>
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
                  <td className="px-5 py-3">
                    <button
                      onClick={() => void replayDlqMessage(message)}
                      disabled={replayingKey === replayKey}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-[12px] font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                    >
                      {replayingKey === replayKey ? '재처리 중' : '재처리'}
                    </button>
                  </td>
                </tr>
              )
            }) : (
              <EmptyRow colSpan={7} loading={loading} text="DLQ에 보관된 실패 메시지가 없습니다." />
            )}
          </tbody>
        </table>
      </section>

      <div className="mt-4 grid grid-cols-[420px_1fr] gap-4">
        <section className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
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
        </section>

        <section className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
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
                className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-bold text-[#4E5968] transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => setRecentJobPage((page) => Math.min(recentJobPageCount, page + 1))}
                disabled={recentJobPage >= recentJobPageCount}
                className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-bold text-[#4E5968] transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <TableHead>Job</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Partition</TableHead>
                <TableHead>Offset</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Time</TableHead>
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
                <EmptyRow colSpan={6} loading={loading} text="최근 Kafka Job 추적 데이터가 없습니다." />
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
          <h3 className="text-[14px] font-extrabold text-[#191F28]">Worker 상태</h3>
          <div className="text-[12px] text-[#8B95A1]">
            Online {formatNumber(workerData?.stats.onlineCount ?? 0)} · Stale {formatNumber(workerData?.stats.staleCount ?? 0)} · Stopped {formatNumber(workerData?.stats.stoppedCount ?? 0)}
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <TableHead>Worker</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>PID</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Interval</TableHead>
              <TableHead>상태</TableHead>
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
              <EmptyRow colSpan={7} loading={loading} text="Worker heartbeat 데이터가 없습니다." />
            )}
          </tbody>
        </table>
      </section>
    </Layout>
  )
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8B95A1]">
      {children}
    </th>
  )
}

function EmptyRow({ colSpan, loading, text }: { colSpan: number; loading: boolean; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-8 text-center text-[13px] text-[#8B95A1]">
        {loading ? '불러오는 중입니다.' : text}
      </td>
    </tr>
  )
}

function FailureBadge({ info, message }: { info: FailureInfo; message: string | null }) {
  const cls = info.retryable === false
    ? 'bg-red-50 text-red-700'
    : info.retryable === true
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-600'

  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${cls}`} title={message ?? undefined}>
      {info.code} · {info.reason}
    </span>
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
      <span className="inline-block h-2 w-2 rounded-full bg-current" />
      {status}
    </span>
  )
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
    reason: '확인 필요',
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value)
}

function formatDateTime(value: string): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function joinList(values: string[]): string {
  return values.filter(Boolean).join(', ')
}
