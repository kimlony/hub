import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

interface ChannelInfo {
  mallKey:    string
  mallName:   string
  registered: boolean
  useYn:      string | null
}

interface Props {
  onClose: () => void
}

export default function CollectRequestModal({ onClose }: Props) {
  const authenticatedFetch = useAuthenticatedFetch()
  const today     = new Date().toISOString().slice(0, 10)

  const [startDate,  setStartDate]  = useState(today)
  const [endDate,    setEndDate]    = useState(today)
  const [channels,   setChannels]   = useState<ChannelInfo[]>([])
  const [selected,   setSelected]   = useState<Set<string>>(new Set())
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const allRef = useRef<HTMLInputElement>(null)

  const activeMalls  = channels.filter(c => c.registered && c.useYn === 'Y')
  const allChecked   = activeMalls.length > 0 && selected.size === activeMalls.length
  const someChecked  = selected.size > 0 && !allChecked

  useEffect(() => {
    authenticatedFetch('/api/channels')
      .then(r => r.json())
      .then((data: ChannelInfo[]) => setChannels(data))
      .finally(() => setLoading(false))
  }, [authenticatedFetch])

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someChecked
  }, [someChecked])

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(activeMalls.map(c => c.mallKey)))
  }

  function toggleMall(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function formatDate(dateStr: string) {
    return dateStr.replace(/-/g, '')
  }

  async function handleSubmit() {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/hub/jobs/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frDt:     formatDate(startDate),
          toDt:     formatDate(endDate),
          mallKeys: [...selected],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message ?? '수집 요청 실패')
      }
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '수집 요청 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[420px] bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-[16px] font-extrabold text-[#191F28]">수집 요청</h2>
          <button onClick={onClose} className="text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 수집 기간 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2">수집 기간</label>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" />
              <span className="text-[#8B95A1] text-[13px]">~</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" />
            </div>
          </div>

          {/* 쇼핑몰 선택 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2">쇼핑몰 선택</label>
            {loading ? (
              <div className="py-8 text-center text-[13px] text-[#8B95A1]">불러오는 중...</div>
            ) : activeMalls.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#8B95A1]">
                등록된 채널이 없습니다.<br />
                <span className="text-[11px]">채널 관리에서 채널을 등록해 주세요.</span>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <label className="flex items-center gap-3 px-4 py-3 bg-[#FAFAFA] border-b border-slate-100 cursor-pointer hover:bg-slate-50">
                  <input ref={allRef} type="checkbox" checked={allChecked} onChange={toggleAll}
                    className="w-4 h-4 accent-[#3182F6]" />
                  <span className="text-[13px] font-bold text-[#191F28]">전체 선택</span>
                  <span className="ml-auto text-[12px] text-[#8B95A1]">{selected.size} / {activeMalls.length}</span>
                </label>
                {activeMalls.map(ch => (
                  <label key={ch.mallKey} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(ch.mallKey)} onChange={() => toggleMall(ch.mallKey)}
                      className="w-4 h-4 accent-[#3182F6]" />
                    <span className="text-[13px] text-[#4E5968]">{ch.mallName}</span>
                    <span className="ml-auto text-[11px] font-bold text-[#8B95A1]">{ch.mallKey}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-[12px] text-red-500">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitting}
            className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? '요청 중...' : '수집 요청'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
