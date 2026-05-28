import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

interface ChannelInfo {
  mallKey:    string
  mallName:   string
  registered: boolean
  useYn:      string | null
  mallId:     string | null
  mallPw:     string | null
  vendorId:   string | null
  key:        string | null
  key2:       string | null
  authKey:    string | null
}

interface FormState {
  key:      string
  key2:     string
  authKey:  string
  mallId:   string
  mallPw:   string
  vendorId: string
}

const EMPTY_FORM: FormState = { key: '', key2: '', authKey: '', mallId: '', mallPw: '', vendorId: '' }

interface Props {
  onClose: () => void
}

export default function ChannelManagementModal({ onClose }: Props) {
  const authenticatedFetch = useAuthenticatedFetch()
  const [channels,  setChannels]  = useState<ChannelInfo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    authenticatedFetch('/api/channels')
      .then(r => r.json())
      .then(setChannels)
      .finally(() => setLoading(false))
  }, [authenticatedFetch])

  function openForm(mallKey: string) {
    setExpanded(mallKey)
    setForm(EMPTY_FORM)
  }

  function closeForm() {
    setExpanded(null)
    setForm(EMPTY_FORM)
  }

  async function reload() {
    const data = await authenticatedFetch('/api/channels').then(r => r.json())
    setChannels(data)
  }

  async function handleSave(ch: ChannelInfo) {
    setSaving(true)
    const method = ch.registered ? 'PUT' : 'POST'
    await authenticatedFetch(`/api/channels/${ch.mallKey}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    await reload()
    closeForm()
    setSaving(false)
  }

  async function handleDelete(mallKey: string) {
    if (!confirm(`${mallKey} 채널을 삭제하시겠습니까?`)) return
    await authenticatedFetch(`/api/channels/${mallKey}`, { method: 'DELETE' })
    await reload()
  }

  async function handleToggle(mallKey: string) {
    await authenticatedFetch(`/api/channels/${mallKey}/active`, { method: 'PATCH' })
    await reload()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[500px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">채널 관리</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
          ) : channels.map(ch => (
            <div key={ch.mallKey} className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Channel row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-[#FAFAFA]">
                <div className="flex-1">
                  <span className="text-[13px] font-bold text-[#191F28]">{ch.mallName}</span>
                  <span className="ml-2 text-[11px] font-bold text-[#8B95A1]">{ch.mallKey}</span>
                </div>
                {ch.registered ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(ch.mallKey)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                        ch.useYn === 'Y'
                          ? 'bg-[#E8FAF0] text-[#00C073]'
                          : 'bg-[#F2F4F6] text-[#8B95A1]'
                      }`}
                    >
                      {ch.useYn === 'Y' ? '활성' : '비활성'}
                    </button>
                    <button
                      onClick={() => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(ch.mallKey)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-50 text-[#FF6B6B] hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey)}
                    className="px-3 py-1 text-[11px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600"
                  >
                    등록
                  </button>
                )}
              </div>

              {/* 폼 (펼쳐질 때) */}
              {expanded === ch.mallKey && (
                <div className="px-4 py-4 border-t border-slate-100 space-y-3">
                  {([
                    { label: 'mall_id',   field: 'mallId'   as keyof FormState, type: 'text'     },
                    { label: 'mall_pw',   field: 'mallPw'   as keyof FormState, type: 'password' },
                    { label: 'vendor_id', field: 'vendorId' as keyof FormState, type: 'text'     },
                    { label: 'key1',      field: 'key'      as keyof FormState, type: 'text'     },
                    { label: 'key2',      field: 'key2'     as keyof FormState, type: 'text'     },
                  ]).map(({ label, field, type }) => (
                    <div key={field} className="flex items-center gap-3">
                      <label className="w-20 text-[12px] font-semibold text-[#8B95A1] flex-shrink-0">{label}</label>
                      <input
                        type={type}
                        value={form[field]}
                        placeholder={ch.registered ? '변경 시에만 입력 (빈칸 = 기존값 유지)' : ''}
                        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={closeForm} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">
                      취소
                    </button>
                    <button
                      onClick={() => handleSave(ch)}
                      disabled={saving}
                      className="px-3 py-1.5 text-[12px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="w-full px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
