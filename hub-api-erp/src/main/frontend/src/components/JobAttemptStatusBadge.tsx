import type { JobAttemptStatus } from '../api/jobExecution'

const STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-blue-50 text-blue-700',
  SUCCESS: 'bg-emerald-50 text-emerald-700',
  RETRY: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-orange-50 text-orange-700',
}

export default function JobAttemptStatusBadge({ status }: { status: JobAttemptStatus }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}
