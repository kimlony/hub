import { useState, ReactNode } from 'react'
import Sidebar from './Sidebar'
import ChannelManagementModal from './ChannelManagementModal'
import SettingsModal from './SettingsModal'

interface Props {
  title: string
  actions?: ReactNode
  children: ReactNode
}

export default function Layout({ title, actions, children }: Props) {
  const [channelModal, setChannelModal] = useState(false)
  const [settingsModal, setSettingsModal] = useState(false)
  return (
    <div className="flex h-screen overflow-hidden bg-[#F9FAFB]">
      {channelModal && <ChannelManagementModal onClose={() => setChannelModal(false)} />}
      {settingsModal && <SettingsModal onClose={() => setSettingsModal(false)} />}
      <Sidebar onOpenSettings={() => setSettingsModal(true)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="h-[60px] flex items-center justify-between px-6 bg-white border-b border-slate-100 flex-shrink-0">
          <h1 className="text-[17px] font-extrabold text-[#191F28]">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChannelModal(true)}
              className="px-3 py-2 text-[12px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors"
            >
              채널 관리
            </button>
            {actions && <div className="flex items-center gap-2">{actions}</div>}

          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
