import { useState } from 'react'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import CollectRequestModal from '../components/CollectRequestModal'

const recentJobs = [
  { id: 'a1b2c3d4', channel: '11ST',    period: '05/26~05/26', status: 'SUCCESS',    time: '2분 전' },
  { id: 'e5f6a7b8', channel: 'GCHAN',   period: '05/26~05/26', status: 'PROCESSING', time: '5분 전' },
  { id: 'c9d0e1f2', channel: 'COUPANG', period: '05/25~05/26', status: 'FAILED',     time: '8분 전' },
  { id: 'g3h4i5j6', channel: 'NSS',     period: '05/26~05/26', status: 'QUEUED',     time: '11분 전' },
  { id: 'k7l8m9n0', channel: '11ST',    period: '05/25~05/25', status: 'SUCCESS',    time: '15분 전' },
]

const channels = [
  { label: '11번가',            gradient: 'from-[#e8192c] to-[#ff6b6b]', initial: '11', count: 48, pct: 75 },
  { label: '선물찬스',          gradient: 'from-[#ff6f00] to-[#ffa040]', initial: 'G',  count: 32, pct: 50 },
  { label: '쿠팡',              gradient: 'from-[#ee2b2b] to-[#ff6060]', initial: 'C',  count: 27, pct: 42 },
  { label: '네이버 스마트스토어', gradient: 'from-[#03c75a] to-[#3ddc97]', initial: 'N',  count: 21, pct: 33 },
]

const stats = [
  { label: '오늘 총 수집 요청', value: '128', sub: '↑ 12 어제 대비', gradient: 'from-[#3182F6] to-[#5BABF9]' },
  { label: '성공',             value: '119', sub: '성공률 93%',       gradient: 'from-[#00C073] to-[#3DDC97]' },
  { label: '실패',             value: '9',   sub: '재시도 대기 3건',   gradient: 'from-[#FF6B6B] to-[#FF9A9A]' },
  { label: '처리 중',          value: '5',   sub: 'QUEUED 2 · PROC 3', gradient: 'from-amber-400 to-yellow-300' },
]

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
    {modalOpen && <CollectRequestModal onClose={() => setModalOpen(false)} />}
    <Layout
      title="대시보드"
      actions={
        <>
          <button className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors">
            새로고침
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors"
          >
            + 수집 요청
          </button>
        </>
      }
    >
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.label} className={`bg-gradient-to-br ${s.gradient} rounded-2xl p-5 text-white`}>
            <p className="text-[12px] font-semibold opacity-85 mb-2">{s.label}</p>
            <p className="text-[28px] font-extrabold leading-none">{s.value}</p>
            <p className="text-[11px] opacity-80 mt-1.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent jobs */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">최근 작업</h3>
            <span className="text-[12px] text-[#3182F6] font-semibold cursor-pointer hover:underline">전체 보기 →</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#FAFAFA]">
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">채널</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">상태</th>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide">시간</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-2.5 text-[13px] font-bold text-[#191F28]">{j.channel}</td>
                  <td className="px-5 py-2.5"><StatusBadge status={j.status} /></td>
                  <td className="px-5 py-2.5 text-[12px] text-[#8B95A1]">{j.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Channel stats */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-[14px] font-extrabold text-[#191F28]">채널별 수집 현황</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {channels.map((ch) => (
              <div key={ch.label} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-9 h-9 bg-gradient-to-br ${ch.gradient} rounded-xl flex items-center justify-content-center items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0`}>
                  {ch.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-[13px] font-bold text-[#191F28] truncate">{ch.label}</span>
                    <span className="text-[13px] font-bold text-[#191F28] ml-2 flex-shrink-0">{ch.count}건</span>
                  </div>
                  <div className="h-1.5 bg-[#F2F4F6] rounded-full">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#5BABF9]"
                      style={{ width: `${ch.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
    </>
  )
}
