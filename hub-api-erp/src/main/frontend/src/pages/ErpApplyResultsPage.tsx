import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import {
  ErpApplyResult,
  ErpApplyResultDetail,
  JobPipeline,
  JobLog,
  fetchErpApplyResultDetail,
  fetchErpApplyResults,
  fetchJobPipeline,
  fetchJobLogs,
  retryErpApplyJob,
} from '../api/erpApply'

const PAGE_SIZE = 20

export default function ErpApplyResultsPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [status, setStatus] = useState('')
  const [erpConnectionId, setErpConnectionId] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [query, setQuery] = useState({ status: '', erpConnectionId: '', correlationId: '', requestId: '' })
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<ErpApplyResult[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [pipelineRequestId, setPipelineRequestId] = useState<string | null>(null)

  const loadResults = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchErpApplyResults(authenticatedFetch, { ...query, page, size: PAGE_SIZE })
      setResults(response.results)
      setTotalCount(response.totalCount)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ERP 반영 결과를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, page, query])

  useEffect(() => { void loadResults() }, [loadResults])

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setQuery({
      status,
      erpConnectionId: erpConnectionId.trim(),
      correlationId: correlationId.trim(),
      requestId: requestId.trim(),
    })
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <>
      {detailId !== null && (
        <ResultDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
      {pipelineRequestId && (
        <PipelineModal requestId={pipelineRequestId} onClose={() => setPipelineRequestId(null)} onRetrySuccess={loadResults} />
      )}
      <Layout title="ERP 반영 결과">
        <form onSubmit={handleSearch} className="mb-5 rounded-lg bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <label className="text-[12px] font-bold text-[#4E5968]">
              상태
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                <option value="">전체</option>
                <option value="APPLIED">APPLIED</option>
                <option value="FAILED">FAILED</option>
                <option value="RETRY_WAIT">RETRY_WAIT</option>
              </select>
            </label>
            <FilterInput label="ERP Connection" value={erpConnectionId} onChange={setErpConnectionId} />
            <FilterInput label="Correlation ID" value={correlationId} onChange={setCorrelationId} />
            <FilterInput label="Request ID" value={requestId} onChange={setRequestId} />
            <div className="flex items-end">
              <button className="w-full rounded-lg bg-[#3182F6] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-blue-600">
                조회
              </button>
            </div>
          </div>
        </form>

        {error && <ErrorBox message={error} />}
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1900px] w-full">
              <thead><tr className="border-b border-slate-100 bg-[#FAFAFA]">
                {['ID', 'Request ID', 'Correlation ID', 'Order ID', 'ERP Connection', 'Operation', 'Status',
                  'ERP Document', 'Error', 'Attempt', 'Applied At', 'Created At', 'Updated At', 'Action'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-[#8B95A1]">{header}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading ? <EmptyRow message="ERP 결과를 불러오는 중입니다..." />
                  : results.length === 0 ? <EmptyRow message="조회된 ERP 반영 결과가 없습니다." />
                    : results.map((result) => (
                      <tr key={result.id} className={`border-t border-slate-50 hover:bg-slate-50 ${result.status === 'FAILED' ? 'bg-red-50/30' : ''}`}>
                        <Cell>{result.id}</Cell>
                        <IdCell value={result.requestId} />
                        <IdCell value={result.correlationId} />
                        <Cell>{result.normalizedOrderId}</Cell>
                        <Cell>{result.erpConnectionId}</Cell>
                        <Cell>{result.operation}</Cell>
                        <td className="px-4 py-3"><ErpStatus status={result.status} /></td>
                        <Cell>{result.erpDocumentNo ?? '-'}</Cell>
                        <td className="max-w-[260px] px-4 py-3">
                          {result.errorCode ? <div className="font-bold text-red-600">{result.errorCode}</div> : '-'}
                          {result.errorMessage && <div className="mt-1 truncate text-[11px] text-red-500" title={result.errorMessage}>{result.errorMessage}</div>}
                        </td>
                        <Cell>{result.attemptCount}</Cell>
                        <Cell>{formatDateTime(result.appliedAt)}</Cell>
                        <Cell>{formatDateTime(result.createdAt)}</Cell>
                        <Cell>{formatDateTime(result.updatedAt)}</Cell>
                        <td className="px-4 py-3"><div className="flex gap-2">
                          <button onClick={() => setDetailId(result.id)} className={secondaryButton}>상세</button>
                          <button onClick={() => setPipelineRequestId(result.requestId)} className={secondaryButton}>Pipeline</button>
                        </div></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
            <span className="text-[13px] text-[#8B95A1]">총 {totalCount.toLocaleString()}건</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={pageButton}>이전</button>
              <span className="text-[12px] font-bold text-[#4E5968]">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className={pageButton}>다음</button>
            </div>
          </div>
        </div>
      </Layout>
    </>
  )
}

function ResultDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [detail, setDetail] = useState<ErpApplyResultDetail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetchErpApplyResultDetail(authenticatedFetch, id)
      .then((value) => { if (active) setDetail(value) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '상세 조회에 실패했습니다.') })
    return () => { active = false }
  }, [authenticatedFetch, id])

  return <Modal title={`ERP 결과 상세 #${id}`} onClose={onClose}>
    {error ? <ErrorBox message={error} /> : !detail ? <Loading /> : <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Request ID" value={detail.result.requestId} />
        <Summary label="Correlation ID" value={detail.result.correlationId} />
        <Summary label="Status" value={detail.result.status} danger={detail.result.status === 'FAILED'} />
        <Summary label="ERP Document" value={detail.result.erpDocumentNo ?? '-'} />
        <Summary label="Error Code" value={detail.result.errorCode ?? '-'} danger={Boolean(detail.result.errorCode)} />
        <Summary label="Error Message" value={detail.result.errorMessage ?? '-'} danger={Boolean(detail.result.errorMessage)} />
        <Summary label="Request bytes" value={String(detail.payloadSummary.requestBytes)} />
        <Summary label="Response bytes" value={String(detail.payloadSummary.responseBytes)} />
      </div>
      <JsonPanel title="Request Payload" value={detail.requestPayload} />
      <JsonPanel title="Response Payload" value={detail.responsePayload} />
    </>}
  </Modal>
}

function PipelineModal({
  requestId,
  onClose,
  onRetrySuccess,
}: {
  requestId: string
  onClose: () => void
  onRetrySuccess: () => void | Promise<void>
}) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [pipeline, setPipeline] = useState<JobPipeline | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [jobLogs, setJobLogs] = useState<Record<string, JobLog[]>>({})
  const [logsLoading, setLogsLoading] = useState(false)

  const loadPipeline = useCallback(async () => {
    setError('')
    try {
      const nextPipeline = await fetchJobPipeline(authenticatedFetch, requestId)
      setPipeline(nextPipeline)
      setLogsLoading(true)
      const logResponses = await Promise.all(
        nextPipeline.jobs.map((job) => fetchJobLogs(authenticatedFetch, job.requestId)),
      )
      setJobLogs(Object.fromEntries(logResponses.map((response) => [response.requestId, response.logs])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pipeline 또는 Job 로그 조회에 실패했습니다.')
    } finally {
      setLogsLoading(false)
    }
  }, [authenticatedFetch, requestId])

  useEffect(() => { void loadPipeline() }, [loadPipeline])

  const failedErpJob = pipeline?.jobs.find((job) => job.jobType === 'ERP_APPLY' && job.status === 'FAILED')
  const canRetryErp = Boolean(
    pipeline?.retryable
    && pipeline.failedStage === 'ERP_APPLY'
    && pipeline.retryFromJobType === 'ERP_APPLY'
    && failedErpJob,
  )

  async function handleRetry() {
    if (!failedErpJob || !canRetryErp || retrying) return
    if (!window.confirm(`실패한 ERP_APPLY 작업을 재처리할까요?\n${failedErpJob.requestId}`)) return
    setRetrying(true)
    setError('')
    setSuccess('')
    try {
      await retryErpApplyJob(authenticatedFetch, failedErpJob.requestId)
      setSuccess('ERP_APPLY 재처리를 요청했습니다. Outbox 발행 대기 상태로 전환됩니다.')
      await Promise.all([loadPipeline(), Promise.resolve(onRetrySuccess())])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ERP_APPLY 재처리에 실패했습니다.')
    } finally {
      setRetrying(false)
    }
  }

  return <Modal title="Job Pipeline" onClose={onClose} wide>
    {error && <ErrorBox message={error} />}
    {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700">{success}</div>}
    {!pipeline ? (error ? null : <Loading />) : <>
      <div className={`grid grid-cols-2 gap-3 rounded-lg p-4 md:grid-cols-3 ${pipeline.failedStage ? 'border border-red-200 bg-red-50' : 'bg-slate-50'}`}>
        <Summary label="Correlation ID" value={pipeline.correlationId} />
        <Summary label="Root Job" value={pipeline.rootJobId} />
        <Summary label="Current Stage" value={pipeline.currentStage} />
        <Summary label="Failed Stage" value={pipeline.failedStage ?? '-'} danger={Boolean(pipeline.failedStage)} />
        <Summary label="Retryable" value={pipeline.retryable ? 'YES' : 'NO'} danger={Boolean(pipeline.failedStage)} />
        <Summary label="Retry From" value={pipeline.retryFromJobType ?? '-'} danger={Boolean(pipeline.failedStage)} />
      </div>
      <h3 className="mb-3 mt-6 text-[14px] font-extrabold text-[#191F28]">Job 흐름</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {pipeline.jobs.map((job, index) => <div key={job.requestId} className={`relative rounded-lg border p-4 ${job.status === 'FAILED' ? 'border-red-300 bg-red-50' : 'border-slate-100'}`}>
          <div className="flex justify-between"><strong className="text-[13px]">{index + 1}. {job.jobType}</strong><ErpStatus status={job.status} /></div>
          <PipelineField label="requestId" value={job.requestId} />
          <PipelineField label="parentJobId" value={job.parentJobId} />
          <PipelineField label="causationId" value={job.causationId} />
          <PipelineField label="retryCount" value={String(job.retryCount)} />
          <PipelineField label="createdAt" value={formatDateTime(job.createdAt)} />
          <PipelineField label="updatedAt" value={formatDateTime(job.updatedAt)} />
          {job.errorMessage && <p className="mt-3 break-words text-[11px] font-semibold text-red-600">{job.errorMessage}</p>}
        </div>)}
      </div>
      <h3 className="mb-3 mt-6 text-[14px] font-extrabold text-[#191F28]">ERP 결과</h3>
      {pipeline.erpApplyResults.length === 0 ? <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">ERP 반영 대기 · ERP_APPLY Job이 아직 생성되지 않았습니다.</div> : pipeline.erpApplyResults.map((result) => (
        <div key={`${result.requestId}-${result.normalizedOrderId}`} className={`mb-2 rounded-lg border p-4 ${result.status === 'FAILED' ? 'border-red-300 bg-red-50' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3"><ErpStatus status={result.status} /><strong>{result.erpDocumentNo ?? '-'}</strong></div>
          <p className="mt-2 font-mono text-[11px] text-[#8B95A1]">{result.requestId} · order {result.normalizedOrderId}</p>
          {(result.errorCode || result.errorMessage) && <p className="mt-2 text-[12px] font-bold text-red-600">{result.errorCode ?? 'ERROR'} · {result.errorMessage}</p>}
        </div>
      ))}
      <JobLogTimeline jobs={pipeline.jobs} logsByRequestId={jobLogs} loading={logsLoading} />
      <button
        disabled={!canRetryErp || retrying}
        onClick={() => void handleRetry()}
        title={canRetryErp ? '실패한 ERP_APPLY Job을 Outbox를 통해 재처리합니다.' : 'ERP_APPLY FAILED 상태이며 retryable인 경우에만 재처리할 수 있습니다.'}
        className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {retrying ? '재처리 요청 중...' : 'ERP_APPLY 재처리'}
      </button>
    </>}
  </Modal>
}
function JobLogTimeline({
  jobs,
  logsByRequestId,
  loading,
}: {
  jobs: JobPipeline['jobs']
  logsByRequestId: Record<string, JobLog[]>
  loading: boolean
}) {
  return <section className="mt-6 border-t border-slate-100 pt-6">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[14px] font-extrabold text-[#191F28]">Job 로그 타임라인</h3>
      {loading && <span className="text-[11px] font-semibold text-[#8B95A1]">로그 갱신 중...</span>}
    </div>
    <div className="space-y-4">
      {jobs.map((job) => {
        const logs = [...(logsByRequestId[job.requestId] ?? [])].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id - right.id,
        )
        return <div key={`logs-${job.requestId}`} className="rounded-lg border border-slate-100 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="text-[13px] text-[#191F28]">{job.jobType}</strong>
            <ErpStatus status={job.status} />
            <span className="font-mono text-[10px] text-[#8B95A1]">{job.requestId}</span>
          </div>
          {logs.length === 0 ? <p className="text-[12px] text-[#8B95A1]">저장된 로그가 없습니다.</p> :
            <ol className="relative ml-2 border-l border-slate-200">
              {logs.map((log) => <JobLogTimelineItem key={log.id} log={log} />)}
            </ol>}
        </div>
      })}
    </div>
  </section>
}

function JobLogTimelineItem({ log }: { log: JobLog }) {
  const status = resolveLogStatus(log)
  const errorCode = resolveLogErrorCode(log)
  const failed = log.level === 'ERROR' || status === 'FAILED' || Boolean(log.errorMessage)
  const retryLabel = log.retryCount === null
    ? null
    : `retry ${log.retryCount}/${log.maxRetryCount ?? '-'}`
  return <li className={`relative ml-5 pb-4 last:pb-0 ${failed ? 'text-red-700' : 'text-[#4E5968]'}`}>
    <span className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${failed ? 'bg-red-500' : log.level === 'WARN' ? 'bg-amber-500' : 'bg-blue-500'}`} />
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] text-[#8B95A1]">{formatLogTime(log.createdAt)}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${failed ? 'bg-red-50 text-red-700' : log.level === 'WARN' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{log.level}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold">{status}</span>
      {errorCode && <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-red-700">{errorCode}</span>}
      {retryLabel && <span className="text-[10px] font-bold text-amber-700">{retryLabel}</span>}
    </div>
    <p className={`mt-1 text-[12px] font-semibold ${failed ? 'text-red-700' : 'text-[#4E5968]'}`}>{log.message}</p>
    {log.errorMessage && <p className="mt-1 break-words text-[11px] text-red-600">{log.errorMessage}</p>}
    <p className="mt-1 font-mono text-[10px] text-[#8B95A1]">{log.eventType}</p>
  </li>
}

function resolveLogStatus(log: JobLog): string {
  if (log.detail) {
    try {
      const detail = JSON.parse(log.detail) as { toStatus?: unknown; status?: unknown }
      const value = detail.toStatus ?? detail.status
      if (typeof value === 'string' && value) return value
    } catch {
      // Fall back to the event type when detail is not JSON.
    }
  }
  const event = log.eventType.toUpperCase()
  if (event.includes('SUCCESS')) return 'SUCCESS'
  if (event.includes('FAILED') || event.includes('DLQ')) return 'FAILED'
  if (event.includes('PROCESSING')) return 'PROCESSING'
  if (event.includes('RETRY')) return 'RETRY'
  if (event.includes('QUEUED')) return 'QUEUED'
  return event
}

function resolveLogErrorCode(log: JobLog): string | null {
  const source = `${log.errorMessage ?? ''} ${log.message}`
  return source.match(/\b(ERP_[A-Z0-9_]+|HTTP\s+\d{3}|E[A-Z_]+)\b/i)?.[1] ?? null
}

function formatLogTime(value: string): string {
  const match = value.match(/(\d{2}:\d{2}:\d{2})/)
  return match?.[1] ?? value
}
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30'
const secondaryButton = 'rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-[#4E5968] hover:bg-slate-200'
const pageButton = 'rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-semibold text-[#4E5968] disabled:opacity-40'

function FilterInput({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="text-[12px] font-bold text-[#4E5968]">{label}<input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} /></label>
}
function Cell({ children }: { children: React.ReactNode }) { return <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#4E5968]">{children}</td> }
function IdCell({ value }: { value: string }) { return <td className="max-w-[190px] truncate px-4 py-3 font-mono text-[11px] text-[#4E5968]" title={value}>{value}</td> }
function EmptyRow({ message }: { message: string }) { return <tr><td colSpan={14} className="px-5 py-12 text-center text-[13px] text-[#8B95A1]">{message}</td></tr> }
function ErrorBox({ message }: { message: string }) { return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">{message}</div> }
function Loading() { return <div className="py-12 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div> }
function ErpStatus({ status }: { status: string }) {
  const color = status === 'APPLIED' || status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : status === 'FAILED' ? 'bg-red-50 text-red-700' : status === 'RETRY_WAIT' || status === 'QUEUED' ? 'bg-amber-50 text-amber-700' : status === 'PROCESSING' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${color}`}>{status || 'UNKNOWN'}</span>
}
function formatDateTime(value: string | null) { if (!value) return '-'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { hour12: false }) }
function JsonPanel({ title, value }: { title: string; value: unknown }) { return <div className="mt-5"><h3 className="mb-2 text-[13px] font-extrabold">{title}</h3><pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-4 text-[11px] text-slate-100">{JSON.stringify(value, null, 2)}</pre></div> }
function Summary({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div><div className="text-[10px] font-bold uppercase text-[#8B95A1]">{label}</div><div className={`mt-1 break-all text-[12px] font-bold ${danger ? 'text-red-600' : 'text-[#191F28]'}`}>{value}</div></div> }
function PipelineField({ label, value }: { label: string; value: string | null }) { return <p className="mt-2 break-all text-[11px] text-[#8B95A1]"><span className="font-bold text-[#4E5968]">{label}</span> {value ?? '-'}</p> }
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><div className={`relative max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl ${wide ? 'w-[1200px]' : 'w-[900px]'} max-w-full`}><div className="flex items-center justify-between border-b px-6 py-4"><h2 className="text-[16px] font-extrabold">{title}</h2><button onClick={onClose} className="text-xl text-[#8B95A1]">×</button></div><div className="max-h-[calc(90vh-65px)] overflow-auto p-6">{children}</div></div></div>, document.body)
}
