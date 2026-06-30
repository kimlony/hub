import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

interface ChannelInfo {
  channelAccountId: number | null
  corpId: number
  mallKey: string
  mallName: string
  accountName: string | null
  registered: boolean
  useYn: string | null
  mallId: string | null
  mallPw: string | null
  vendorId: string | null
  key: string | null
  key2: string | null
  authKey: string | null
}

interface FormState {
  accountName: string
  key: string
  key2: string
  authKey: string
  mallId: string
  mallPw: string
  vendorId: string
}

const EMPTY_FORM: FormState = {
  accountName: '',
  key: '',
  key2: '',
  authKey: '',
  mallId: '',
  mallPw: '',
  vendorId: '',
}

interface Props {
  onClose: () => void
}

export default function ChannelManagementModal({ onClose }: Props) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void reload().finally(() => setLoading(false))
  }, [])

  async function reload() {
    const response = await authenticatedFetch('/api/channels')
    if (!response.ok) throw new Error('채널 정보를 불러오지 못했습니다.')
    setChannels(await response.json() as ChannelInfo[])
  }

  function rowKey(channel: ChannelInfo) {
    return channel.registered
      ? `account-${channel.channelAccountId}`
      : `new-${channel.mallKey}`
  }

  function openForm(channel: ChannelInfo) {
    setExpanded(rowKey(channel))
    setError(null)
    setForm({
      ...EMPTY_FORM,
      accountName: channel.registered ? channel.accountName ?? '' : '',
    })
  }

  function closeForm() {
    setExpanded(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function handleSave(channel: ChannelInfo) {
    setSaving(true)
    setError(null)
    try {
      const url = channel.registered
        ? `/api/channels/accounts/${channel.channelAccountId}`
        : `/api/channels/${channel.mallKey}`
      const response = await authenticatedFetch(url, {
        method: channel.registered ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('채널 계정을 저장하지 못했습니다.')
      await reload()
      closeForm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '채널 계정 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(channel: ChannelInfo) {
    if (channel.channelAccountId === null) return
    if (!confirm(`${channel.accountName ?? channel.mallName} 계정을 삭제하시겠습니까?`)) return
    await authenticatedFetch(`/api/channels/accounts/${channel.channelAccountId}`, { method: 'DELETE' })
    await reload()
  }

  async function handleToggle(channel: ChannelInfo) {
    if (channel.channelAccountId === null) return
    await authenticatedFetch(`/api/channels/accounts/${channel.channelAccountId}/active`, { method: 'PATCH' })
    await reload()
  }

  const fields: Array<{ label: string; field: keyof FormState; type: string }> = [
    { label: '계정 이름', field: 'accountName', type: 'text' },
    { label: 'mall_id', field: 'mallId', type: 'text' },
    { label: 'mall_pw', field: 'mallPw', type: 'password' },
    { label: 'vendor_id', field: 'vendorId', type: 'text' },
    { label: 'key1', field: 'key', type: 'text' },
    { label: 'key2', field: 'key2', type: 'text' },
    { label: 'auth_key', field: 'authKey', type: 'text' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[82vh] w-[560px] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">채널 계정 관리</h2>
          <button onClick={onClose} className="text-[20px] leading-none text-[#8B95A1] hover:text-[#4E5968]" aria-label="닫기">×</button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
          ) : channels.map((channel) => {
            const key = rowKey(channel)
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center gap-3 bg-[#FAFAFA] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-bold text-[#191F28]">{channel.mallName}</span>
                    <span className="ml-2 text-[11px] font-bold text-[#8B95A1]">{channel.mallKey}</span>
                    {channel.registered && (
                      <p className="mt-1 truncate text-[12px] text-[#4E5968]">{channel.accountName}</p>
                    )}
                  </div>
                  {channel.registered ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => void handleToggle(channel)} className="px-2.5 py-1 text-[11px] font-bold text-[#3182F6]">
                        {channel.useYn === 'Y' ? '사용 중' : '중지됨'}
                      </button>
                      <button onClick={() => expanded === key ? closeForm() : openForm(channel)} className="px-2.5 py-1 text-[11px] font-semibold text-[#4E5968]">수정</button>
                      <button onClick={() => void handleDelete(channel)} className="px-2.5 py-1 text-[11px] font-semibold text-red-600">삭제</button>
                    </div>
                  ) : (
                    <button onClick={() => expanded === key ? closeForm() : openForm(channel)} className="px-3 py-1 text-[11px] font-bold text-[#3182F6]">계정 추가</button>
                  )}
                </div>

                {expanded === key && (
                  <div className="space-y-3 border-t border-slate-100 px-4 py-4">
                    {fields.map(({ label, field, type }) => (
                      <div key={field} className="flex items-center gap-3">
                        <label className="w-24 flex-shrink-0 text-[12px] font-semibold text-[#8B95A1]">{label}</label>
                        <input
                          type={type}
                          value={form[field]}
                          placeholder={channel.registered && field !== 'accountName' ? '변경할 때만 입력' : ''}
                          onChange={(event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))}
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
                        />
                      </div>
                    ))}
                    {error && <p className="text-[12px] text-red-500">{error}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={closeForm} className="px-3 py-1.5 text-[12px] font-semibold text-[#4E5968]">취소</button>
                      <button onClick={() => void handleSave(channel)} disabled={saving} className="rounded-lg bg-[#3182F6] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
                        {saving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
