import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fetchUserSetting, updateUserSetting, type UserSetting } from '../api/settings'
import { useAuth } from '../context/AuthContext'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const authenticatedFetch = useAuthenticatedFetch()
  const { username, logout } = useAuth()
  const navigate = useNavigate()
  const [setting, setSetting] = useState<UserSetting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetchUserSetting(authenticatedFetch)
      .then((value) => { if (active) setSetting(value) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '환경설정을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [authenticatedFetch])

  async function changeSetting(field: keyof UserSetting, nextValue: boolean) {
    if (!setting || saving) return
    if (field === 'autoErpApply' && nextValue && !window.confirm(
      '주문 수집 후 ERP 자동 반영을 켜시겠습니까? 수집된 주문이 별도 확인 없이 ERP 반영 작업으로 등록됩니다.',
    )) return
    const previous = setting
    const next = { ...setting, [field]: nextValue }
    setSetting(next)
    setSaving(true)
    setError('')
    try {
      setSetting(await updateUserSetting(authenticatedFetch, next))
    } catch (reason) {
      setSetting(previous)
      setError(reason instanceof Error ? reason.message : '환경설정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    logout()
    onClose()
    navigate('/login', { replace: true })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[520px] max-w-full overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div><h2 className="text-[17px] font-extrabold text-[#191F28]">환경설정</h2><p className="mt-1 text-[11px] text-[#8B95A1]">{username}</p></div>
          <button onClick={onClose} className="text-xl text-[#8B95A1]">×</button>
        </div>
        <div className="space-y-6 p-6">
          {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">{error}</div>}
          {loading || !setting ? <div className="py-12 text-center text-[13px] text-[#8B95A1]">환경설정을 불러오는 중...</div> : <>
            <SettingSection title="주문 / ERP">
              <SettingToggle
                label="주문 수집 후 ERP 자동 반영"
                description="켜두면 정규화가 완료된 주문을 자동으로 ERP 반영 작업에 등록합니다. 끄면 ERP 전송 대기 상태로 남습니다."
                checked={setting.autoErpApply}
                disabled={saving}
                onChange={(value) => void changeSetting('autoErpApply', value)}
              />
            </SettingSection>
            <SettingSection title="금융속보">
              <SettingToggle
                label="뉴스 자동수집"
                description="켜두면 금융속보 데이터를 주기적으로 자동 수집합니다. 끄면 수동 새로고침만 사용합니다."
                checked={setting.autoNewsCollect}
                disabled={saving}
                onChange={(value) => void changeSetting('autoNewsCollect', value)}
              />
            </SettingSection>
            <SettingSection title="계정">
              <button onClick={handleLogout} className="w-full rounded-xl bg-red-50 px-4 py-3 text-[13px] font-bold text-red-600 hover:bg-red-100">로그아웃</button>
            </SettingSection>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-3 text-[12px] font-extrabold text-[#8B95A1]">{title}</h3>{children}</section>
}

function SettingToggle({ label, description, checked, disabled, onChange }: {
  label: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void
}) {
  return <div className="flex items-start justify-between gap-5 rounded-xl border border-slate-100 p-4">
    <div><p className="text-[13px] font-extrabold text-[#191F28]">{label}</p><p className="mt-1 text-[12px] leading-5 text-[#8B95A1]">{description}</p></div>
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-[#3182F6]' : 'bg-slate-300'}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
}
