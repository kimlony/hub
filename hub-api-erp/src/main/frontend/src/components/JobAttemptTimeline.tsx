import type { ClaimSource, JobAttempt } from '../api/jobExecution'
import { formatDuration, formatJobExecutionDate } from '../utils/jobExecutionFormat'
import JobAttemptStatusBadge from './JobAttemptStatusBadge'

const CLAIM_SOURCE_STYLES: Record<string, string> = {
  KAFKA: 'bg-blue-50 text-blue-700',
  RECOVERY: 'bg-amber-50 text-amber-700',
  MANUAL: 'bg-violet-50 text-violet-700',
  MIGRATION: 'bg-slate-100 text-slate-600',
}

function ClaimSourceBadge({ source }: { source: ClaimSource }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${CLAIM_SOURCE_STYLES[source] ?? 'bg-slate-100 text-slate-600'}`}>
      {source}
    </span>
  )
}

function claimedAtTime(attempt: JobAttempt): number {
  const time = new Date(attempt.claimedAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

export default function JobAttemptTimeline({ attempts }: { attempts: JobAttempt[] }) {
  const orderedAttempts = [...attempts].sort((left, right) => claimedAtTime(left) - claimedAtTime(right))

  if (orderedAttempts.length === 0) {
    return <div className="py-10 text-center text-[13px] text-[#8B95A1]">처리 시도 이력이 없습니다.</div>
  }

  return (
    <ol className="space-y-0">
      {orderedAttempts.map((attempt, index) => (
        <li key={attempt.attemptId} className="relative border-l-2 border-slate-100 pb-6 pl-5 last:pb-0">
          <span className="absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-full bg-[#3182F6]" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-extrabold text-[#191F28]">Attempt {index + 1}</span>
            <JobAttemptStatusBadge status={attempt.status} />
            <ClaimSourceBadge source={attempt.claimSource} />
            {attempt.status === 'EXPIRED' && attempt.staleRejectedAt && (
              <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                Lease 만료 후 stale 결과 거절
              </span>
            )}
          </div>

          <div className="mt-2 grid gap-x-5 gap-y-1 text-[12px] text-[#4E5968] sm:grid-cols-2">
            <Detail label="Claim 시각" value={formatJobExecutionDate(attempt.claimedAt)} />
            <Detail label="Lease 만료" value={formatJobExecutionDate(attempt.leaseUntil)} />
            <Detail label="완료 시각" value={formatJobExecutionDate(attempt.completedAt)} />
            <Detail label="처리 시간" value={formatDuration(attempt.durationMs)} />
            <Detail label="Fencing token" value={String(attempt.fencingToken)} mono />
            <Detail label="Worker" value={attempt.workerId ?? '-'} mono />
            <Detail label="Attempt ID" value={attempt.attemptId} mono />
            {attempt.staleRejectedAt && <Detail label="Stale 거절 시각" value={formatJobExecutionDate(attempt.staleRejectedAt)} />}
          </div>

          {attempt.errorCode && (
            <p className="mt-2 break-words text-[12px] text-red-600">
              {attempt.errorCode}{attempt.errorMessage ? `: ${attempt.errorMessage}` : ''}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="shrink-0 text-[#8B95A1]">{label}</span>
      <span className={`min-w-0 break-all text-[#4E5968] ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  )
}
