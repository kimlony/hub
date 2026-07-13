type Props = {
  label: string
  value: string
  description?: string
  notice?: string
}

export default function JobExecutionMetricCard({ label, value, description, notice }: Props) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <p className="text-[12px] font-semibold text-[#8B95A1]">{label}</p>
      <p className="mt-2 text-[22px] font-extrabold text-[#191F28]">{value}</p>
      {description && <p className="mt-2 text-[11px] leading-5 text-[#8B95A1]">{description}</p>}
      {notice && <p className="mt-2 text-[11px] leading-5 text-amber-700">{notice}</p>}
    </div>
  )
}
