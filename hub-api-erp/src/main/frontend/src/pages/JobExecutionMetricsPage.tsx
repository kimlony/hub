import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJobExecutionMetrics, type JobExecutionMetrics } from '../api/jobExecution'
import JobExecutionMetricCard from '../components/JobExecutionMetricCard'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'
import { formatDuration, toApiDateTime, toDateTimeLocalValue } from '../utils/jobExecutionFormat'

const JOB_TYPES = ['', 'ORDER_COLLECT', 'ORDER_NORMALIZE', 'ERP_APPLY', 'ORDER_STATUS_SYNC']

function defaultFilters() {
  const now = new Date()
  return {
    from: toDateTimeLocalValue(new Date(now.getTime() - 24 * 60 * 60 * 1_000)),
    to: toDateTimeLocalValue(now),
    jobType: 'ORDER_COLLECT',
  }
}

export default function JobExecutionMetricsPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [filters, setFilters] = useState(defaultFilters)
  const [metrics, setMetrics] = useState<JobExecutionMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMetrics = useCallback(async () => {
    const from = toApiDateTime(filters.from)
    const to = toApiDateTime(filters.to)
    if (new Date(from) > new Date(to)) {
      setError('조회 시작일시는 종료일시보다 빠르거나 같아야 합니다.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      setMetrics(await fetchJobExecutionMetrics(authenticatedFetch, { from, to, jobType: filters.jobType }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Job 실행 지표를 조회하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, filters])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const selectedDuration = useMemo(
    () => filters.jobType ? metrics?.durations.find((duration) => duration.jobType === filters.jobType) ?? null : null,
    [filters.jobType, metrics],
  )
  const smallSampleNotice = filters.jobType && metrics && metrics.totalAttempts < 100
    ? '표본 수가 적어 참고값으로 확인해주세요.'
    : undefined

  const number = (value: number | null | undefined, fractionDigits = 0) => (
    value === null || value === undefined ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits })
  )
  const durationUnavailableDescription = filters.jobType
    ? undefined
    : '전체 Job 유형은 API가 유형별 시간만 반환하므로 처리시간을 합산하지 않습니다.'

  return (
    <Layout title="Job 실행 지표">
      <section className="border-b border-slate-100 pb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[#4E5968]">
            조회 시작일시
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[#4E5968]">
            조회 종료일시
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-[#4E5968]">
            Job 유형
            <select
              value={filters.jobType}
              onChange={(event) => setFilters((current) => ({ ...current, jobType: event.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
            >
              {JOB_TYPES.map((jobType) => <option key={jobType} value={jobType}>{jobType || '전체'}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadMetrics()}
            disabled={loading}
            className="rounded-lg bg-[#3182F6] px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            조회
          </button>
        </div>
        <p className="mt-3 text-[12px] text-[#8B95A1]">
          {filters.from.replace('T', ' ')} ~ {filters.to.replace('T', ' ')} · {filters.jobType || '전체 Job 유형'} 기준
        </p>
      </section>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => void loadMetrics()} className="mt-2 text-[12px] font-bold underline">다시 시도</button>
        </div>
      ) : loading && !metrics ? (
        <div className="py-20 text-center text-[13px] text-[#8B95A1]">Job 실행 지표를 불러오는 중...</div>
      ) : (
        <section className="mt-6" aria-label="Job 실행 지표 요약">
          {loading && <p className="mb-3 text-[12px] text-[#8B95A1]">최신 조회 결과를 불러오는 중...</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <JobExecutionMetricCard label="전체 Attempt 수" value={number(metrics?.totalAttempts)} />
            <JobExecutionMetricCard label="성공 Attempt 수" value={number(metrics?.successAttempts)} />
            <JobExecutionMetricCard label="Recovery Attempt 수" value={number(metrics?.recoveryAttempts)} />
            <JobExecutionMetricCard label="Lease 만료 수" value={number(metrics?.leaseExpiredAttempts)} />
            <JobExecutionMetricCard label="Stale Attempt 거절 수" value={number(metrics?.staleRejectedAttempts)} />
            <JobExecutionMetricCard label="Job당 평균 Attempt 수" value={number(metrics?.averageAttemptsPerJob, 2)} />
            <JobExecutionMetricCard label="평균 처리시간" value={formatDuration(selectedDuration?.averageDurationMs)} description={durationUnavailableDescription} />
            <JobExecutionMetricCard label="p95 처리시간" value={formatDuration(selectedDuration?.p95DurationMs)} description="전체 처리 시도의 95%가 이 시간 안에 완료" notice={smallSampleNotice} />
            <JobExecutionMetricCard label="p99 처리시간" value={formatDuration(selectedDuration?.p99DurationMs)} description="전체 처리 시도의 99%가 이 시간 안에 완료" notice={smallSampleNotice} />
          </div>
        </section>
      )}
    </Layout>
  )
}
