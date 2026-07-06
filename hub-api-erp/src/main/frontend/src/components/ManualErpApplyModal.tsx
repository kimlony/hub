import { FormEvent, useEffect, useRef, useState } from 'react'
import type { AuthenticatedFetch } from '../api/erpApply'
import {
  ErpConnection,
  requestManualErpApply,
} from '../api/manualErp'

type Props = {
  selectedOrderIds: number[]
  connections: ErpConnection[]
  authenticatedFetch: AuthenticatedFetch
  onClose: () => void
  onApplied: (message: string) => void
}

export default function ManualErpApplyModal({
  selectedOrderIds,
  connections,
  authenticatedFetch,
  onClose,
  onApplied,
}: Props) {
  const [erpConnectionId, setErpConnectionId] = useState(connections[0]?.erpConnectionId ?? '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientRequestIdRef = useRef<string>(crypto.randomUUID())
  const selectedOrderKey = selectedOrderIds.join(',')

    useEffect(() => {
        clientRequestIdRef.current = crypto.randomUUID()
    }, [selectedOrderKey])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!erpConnectionId || selectedOrderIds.length === 0) return
    if (!window.confirm(`선택한 주문 ${selectedOrderIds.length}건을 ERP로 전송할까요?`)) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await requestManualErpApply(authenticatedFetch, {
        clientRequestId: clientRequestIdRef.current,
        erpConnectionId,
        normalizedOrderIds: selectedOrderIds,
        operation: 'CREATE',
        reason: reason.trim() || undefined,
      })
      clientRequestIdRef.current = crypto.randomUUID()
      onApplied(`ERP 전송 접수 ${response.accepted}건${response.skipped > 0 ? ` · 제외 ${response.skipped}건` : ''}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ERP 수동 전송 요청 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="ERP 수동 전송 닫기" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <form onSubmit={submit} className="relative w-[520px] max-w-full rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#191F28]">ERP 수동 전송</h2>
            <p className="mt-1 text-[12px] text-[#8B95A1]">선택한 정규화 주문 {selectedOrderIds.length}건을 전송합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[22px] text-[#8B95A1]" aria-label="닫기">×</button>
        </div>

        <label className="mt-6 block text-[11px] font-bold text-[#4E5968]">
          ERP 연결
          <select
            value={erpConnectionId}
            onChange={(event) => setErpConnectionId(event.target.value)}
            required
            className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#3182F6]"
          >
            {connections.map((connection) => (
              <option key={connection.erpConnectionId} value={connection.erpConnectionId}>
                {connection.erpConnectionId} ({connection.erpType}/{connection.authType})
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-[11px] font-bold text-[#4E5968]">
          전송 사유 (선택)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-slate-200 p-3 text-[12px] outline-none focus:border-[#3182F6]"
            placeholder="운영자가 확인할 수 있는 전송 사유를 입력하세요."
          />
        </label>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="h-9 rounded-lg bg-slate-100 px-4 text-[12px] font-bold text-[#4E5968]">취소</button>
          <button type="submit" disabled={submitting || !erpConnectionId} className="h-9 rounded-lg bg-[#3182F6] px-4 text-[12px] font-bold text-white disabled:opacity-40">
            {submitting ? '접수 중...' : '전송 요청'}
          </button>
        </div>
      </form>
    </div>
  )
}
