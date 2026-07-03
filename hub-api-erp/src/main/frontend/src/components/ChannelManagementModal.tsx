import { useEffect, useMemo, useState } from 'react'
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

const FIELDS: Array<{ label: string; field: keyof FormState; type: string; hint?: string }> = [
  { label: '계정 이름', field: 'accountName', type: 'text', hint: '화면에서 구분할 이름' },
  { label: 'Mall ID', field: 'mallId', type: 'text' },
  { label: 'Mall Password', field: 'mallPw', type: 'password' },
  { label: 'Vendor ID', field: 'vendorId', type: 'text' },
  { label: 'API Key', field: 'key', type: 'text' },
  { label: 'API Key 2', field: 'key2', type: 'text' },
  { label: 'Auth Key', field: 'authKey', type: 'text' },
]

interface Props {
  onClose: () => void
}

export default function ChannelManagementModal({ onClose }: Props) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMallKey, setSelectedMallKey] = useState('')
  const [editingAccount, setEditingAccount] = useState<ChannelInfo | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const channelOptions = useMemo(
    () => channels.filter((channel) => !channel.registered),
    [channels],
  )
  const registeredAccounts = useMemo(
    () => channels.filter((channel) => channel.registered),
    [channels],
  )
  const selectedChannel = channelOptions.find((channel) => channel.mallKey === selectedMallKey) ?? null

  useEffect(() => {
    void reload().catch((caught) => {
      setError(caught instanceof Error ? caught.message : '채널 정보를 불러오지 못했습니다.')
    }).finally(() => setLoading(false))
  }, [])

  async function reload() {
    const response = await authenticatedFetch('/api/channels')
    if (!response.ok) throw new Error('채널 정보를 불러오지 못했습니다.')
    const nextChannels = await response.json() as ChannelInfo[]
    setChannels(nextChannels)
    const options = nextChannels.filter((channel) => !channel.registered)
    setSelectedMallKey((current) => current || options[0]?.mallKey || '')
  }

  function startCreate() {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  function startEdit(channel: ChannelInfo) {
    setEditingAccount(channel)
    setSelectedMallKey(channel.mallKey)
    setForm({
      ...EMPTY_FORM,
      accountName: channel.accountName ?? '',
    })
    setError(null)
  }

  async function handleSave() {
    const target = editingAccount ?? selectedChannel
    if (!target) {
      setError('추가할 채널을 선택해주세요.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const url = editingAccount
        ? `/api/channels/accounts/${editingAccount.channelAccountId}`
        : `/api/channels/${target.mallKey}`
      const response = await authenticatedFetch(url, {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('채널 계정을 저장하지 못했습니다.')
      await reload()
      startCreate()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '채널 계정 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(channel: ChannelInfo) {
    if (channel.channelAccountId === null) return
    if (!confirm(`${channel.accountName ?? channel.mallName} 계정을 사용 중지하시겠습니까?`)) return
    const response = await authenticatedFetch(`/api/channels/accounts/${channel.channelAccountId}`, { method: 'DELETE' })
    if (!response.ok) {
      setError('채널 계정을 사용 중지하지 못했습니다.')
      return
    }
    if (editingAccount?.channelAccountId === channel.channelAccountId) startCreate()
    await reload()
  }

  async function handleToggle(channel: ChannelInfo) {
    if (channel.channelAccountId === null) return
    const response = await authenticatedFetch(`/api/channels/accounts/${channel.channelAccountId}/active`, { method: 'PATCH' })
    if (!response.ok) {
      setError('채널 계정 상태를 변경하지 못했습니다.')
      return
    }
    await reload()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#191F28]">채널 계정 관리</h2>
            <p className="mt-1 text-[12px] text-[#8B95A1]">수집할 쇼핑몰 계정을 추가하고 사용 상태를 관리합니다.</p>
          </div>
          <button onClick={onClose} className="text-[24px] leading-none text-[#8B95A1] hover:text-[#4E5968]" aria-label="닫기">×</button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <section className="border-b border-slate-100 bg-[#FAFBFC] p-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-extrabold text-[#191F28]">{editingAccount ? '계정 수정' : '새 계정 추가'}</p>
                <p className="mt-1 text-[11px] text-[#8B95A1]">인증 정보는 필요한 항목만 입력하세요.</p>
              </div>
              {editingAccount && (
                <button onClick={startCreate} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-[#4E5968] hover:bg-slate-50">
                  추가 모드로
                </button>
              )}
            </div>

            <label className="mb-1.5 block text-[12px] font-bold text-[#4E5968]">채널</label>
            <select
              value={selectedMallKey}
              disabled={Boolean(editingAccount)}
              onChange={(event) => {
                setSelectedMallKey(event.target.value)
                setError(null)
              }}
              className="mb-5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-[#191F28] outline-none focus:ring-2 focus:ring-[#3182F6]/25 disabled:bg-slate-100"
            >
              {channelOptions.length === 0 && <option value="">지원 채널 없음</option>}
              {channelOptions.map((channel) => (
                <option key={channel.mallKey} value={channel.mallKey}>{channel.mallName} ({channel.mallKey})</option>
              ))}
            </select>

            <div className="space-y-3">
              {FIELDS.map(({ label, field, type, hint }) => (
                <div key={field}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-[12px] font-semibold text-[#4E5968]">{label}</label>
                    {hint && <span className="text-[10px] text-[#B0B8C1]">{hint}</span>}
                  </div>
                  <input
                    type={type}
                    value={form[field]}
                    placeholder={editingAccount && field !== 'accountName' ? '변경할 때만 입력' : ''}
                    onChange={(event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[#3182F6]/25"
                  />
                </div>
              ))}
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600">{error}</p>}
            <button
              onClick={() => void handleSave()}
              disabled={saving || (!editingAccount && !selectedChannel)}
              className="mt-5 w-full rounded-xl bg-[#3182F6] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#1B64DA] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? '저장 중...' : editingAccount ? '변경사항 저장' : '채널 계정 추가'}
            </button>
          </section>

          <section className="flex min-h-[360px] flex-col p-6 lg:min-h-0 lg:overflow-hidden">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-[14px] font-extrabold text-[#191F28]">등록된 채널</p>
                <p className="mt-1 text-[11px] text-[#8B95A1]">현재 {registeredAccounts.length}개의 계정이 등록되어 있습니다.</p>
              </div>
              <button onClick={() => void reload()} className="text-[11px] font-bold text-[#3182F6]">새로고침</button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <div className="py-16 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
              ) : registeredAccounts.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                  <p className="text-[13px] font-bold text-[#4E5968]">등록된 채널 계정이 없습니다.</p>
                  <p className="mt-1 text-[11px] text-[#8B95A1]">왼쪽 폼에서 첫 계정을 추가해보세요.</p>
                </div>
              ) : registeredAccounts.map((channel) => {
                const active = channel.useYn === 'Y'
                const editing = editingAccount?.channelAccountId === channel.channelAccountId
                return (
                  <article key={channel.channelAccountId} className={`rounded-xl border p-4 transition ${editing ? 'border-[#3182F6] bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-extrabold text-[#191F28]">{channel.accountName || channel.mallName}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {active ? '사용 중' : '사용 중지'}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-[#8B95A1]">{channel.mallName} · {channel.mallKey}</p>
                      </div>
                      <button onClick={() => startEdit(channel)} className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-[#4E5968] hover:bg-slate-50">수정</button>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-[10px] text-[#B0B8C1]">계정 ID {channel.channelAccountId}</span>
                      <div className="flex gap-3">
                        <button onClick={() => void handleToggle(channel)} className="text-[11px] font-bold text-[#3182F6]">{active ? '사용 중지' : '다시 사용'}</button>
                        <button onClick={() => void handleDelete(channel)} className="text-[11px] font-bold text-red-500">중지</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}