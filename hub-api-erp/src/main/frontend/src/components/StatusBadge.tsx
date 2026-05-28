type Status = 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'RECEIVED'

const styles: Record<Status, string> = {
  RECEIVED:   'bg-purple-50 text-purple-600',
  QUEUED:     'bg-amber-50 text-amber-600',
  PROCESSING: 'bg-blue-50 text-[#3182F6]',
  SUCCESS:    'bg-[#E8FAF0] text-[#00C073]',
  FAILED:     'bg-red-50 text-[#FF6B6B]',
}

export default function StatusBadge({ status }: { status: string }) {
  const cls = styles[status as Status] ?? 'bg-slate-100 text-slate-500'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
      {status}
    </span>
  )
}
