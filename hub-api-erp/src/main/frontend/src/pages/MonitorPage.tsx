import Layout from '../components/Layout'

const topics = [
  { name: 'hub.jobs', partitions: 3, replicas: 1, lag: 2, status: 'HEALTHY' },
]

const brokers = [
  { id: 1, host: 'localhost:9092', status: 'ONLINE' },
]

const stats = [
  { label: '토픽 수',    value: '1',     gradient: 'from-[#3182F6] to-[#5BABF9]' },
  { label: '총 메시지', value: '1,284', gradient: 'from-[#00C073] to-[#3DDC97]' },
  { label: 'Consumer Lag', value: '2', gradient: 'from-amber-400 to-yellow-300' },
]

export default function MonitorPage() {
  return (
    <Layout title="Kafka 현황">
      <div className="grid grid-cols-3 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.label} className={`bg-gradient-to-br ${s.gradient} rounded-2xl p-5 text-white`}>
            <p className="text-[12px] font-semibold opacity-85 mb-2">{s.label}</p>
            <p className="text-[28px] font-extrabold leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Topics */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">토픽</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">토픽명</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">파티션</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Lag</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.name} className="border-t border-slate-50">
                  <td className="px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]">{t.name}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{t.partitions}</td>
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{t.lag}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00C073]">
                      <span className="w-2 h-2 rounded-full bg-[#00C073] inline-block" />
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Brokers */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">브로커</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">ID</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">Host</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b) => (
                <tr key={b.id} className="border-t border-slate-50">
                  <td className="px-5 py-3 text-[13px] text-[#4E5968]">{b.id}</td>
                  <td className="px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]">{b.host}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00C073]">
                      <span className="w-2 h-2 rounded-full bg-[#00C073] inline-block" />
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
