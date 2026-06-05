import { NavLink } from 'react-router-dom'

type NavItem = { label: string; to: string; icon: string; badge?: number }
type NavSection = { section: string; items: NavItem[] }

const nav: NavSection[] = [
  {
    section: '메인',
    items: [{ label: '대시보드', to: '/', icon: 'D' }],
  },
  {
    section: '주문수집',
    items: [
      { label: '작업 목록', to: '/jobs', icon: 'J' },
      { label: '배치 작업', to: '/schedules', icon: 'S' },
    ],
  },
  {
    section: '금융속보',
    items: [{ label: '속보', to: '/news', icon: 'N' }],
  },
  {
    section: '모니터링',
    items: [
      { label: 'Kafka 현황', to: '/monitor', icon: 'K' },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="w-56 flex flex-col flex-shrink-0 bg-white border-r border-slate-100 h-screen">
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3182F6] rounded-xl flex items-center justify-center text-white font-extrabold text-sm">
            B
          </div>
          <div>
            <p className="text-[#191F28] font-extrabold text-[15px] leading-tight">BizBee HUB</p>
            <p className="text-[#8B95A1] text-[11px]">주문수집 플랫폼</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto">
        {nav.map(({ section, items }) => (
          <div key={section} className="mb-5">
            <p className="px-2 mb-1.5 text-[10px] font-semibold text-[#B0B8C1] uppercase tracking-wider">
              {section}
            </p>
            {items.map(({ label, to, icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] mb-0.5 transition-all ` +
                  (isActive
                    ? 'bg-[#EBF3FE] text-[#3182F6] font-bold'
                    : 'text-[#8B95A1] hover:bg-slate-50 hover:text-[#191F28] font-medium')
                }
              >
                <span className="text-[11px] w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center font-extrabold">
                  {icon}
                </span>
                <span className="flex-1">{label}</span>
                {badge !== undefined && (
                  <span className="bg-[#FF6B6B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#191F28] flex items-center justify-center text-white text-sm font-bold">
            K
          </div>
          <div>
            <p className="text-[#191F28] text-[13px] font-bold">관리자</p>
            <p className="text-[#8B95A1] text-[11px]">bizbee.co.kr</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
