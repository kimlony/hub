import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type Filter = { frDt: string; toDt: string; channelCd: string; mallKey: string; orderStatus: string; claimStatus: string; deliveryStatus: string }
type PreviewItem = { normalizedOrderId: number; mallName: string; mallAccount: string; orderNo: string; orderItemNo: string; orderDate: string | null; buyerName: string; receiverName: string; productName: string; optionName: string; quantity: number | null; orderAmount: number | null; orderStatus: string; claimStatus: string; deliveryStatus: string }
type Preview = { totalCount: number; previewCount: number; items: PreviewItem[] }
type History = { exportId: string; status: string; fileName: string; totalCount: number; createdAt: string; completedAt: string | null }
const empty: Filter = { frDt: '', toDt: '', channelCd: '', mallKey: '', orderStatus: '', claimStatus: '', deliveryStatus: '' }

export default function OrderExportPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [filter, setFilter] = useState<Filter>(empty)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [history, setHistory] = useState<History[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const loadHistory = useCallback(async () => { const response = await authenticatedFetch('/api/orders/export/history'); if (response.ok) setHistory(await response.json() as History[]) }, [authenticatedFetch])
  useEffect(() => { void loadHistory() }, [loadHistory])

  async function runPreview(event?: FormEvent) {
    event?.preventDefault(); setLoading(true); setError('')
    try {
      const params = new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, compactDate(value)]))
      const response = await authenticatedFetch(`/api/orders/export/preview?${params}`)
      if (!response.ok) throw new Error('주문 Export 미리보기에 실패했습니다.')
      setPreview(await response.json() as Preview)
    } catch (caught) { setError(caught instanceof Error ? caught.message : '미리보기 오류가 발생했습니다.') }
    finally { setLoading(false) }
  }

  async function downloadExcel() {
    setDownloading(true); setError('')
    try {
      const body = Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, compactDate(value)]))
      const response = await authenticatedFetch('/api/orders/export/excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error('엑셀 다운로드에 실패했습니다.')
      const blob = await response.blob(); const disposition = response.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/); const fileName = match ? decodeURIComponent(match[1]) : `easy-hub-orders-${Date.now()}.xlsx`
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url)
      await loadHistory()
    } catch (caught) { setError(caught instanceof Error ? caught.message : '엑셀 다운로드 오류가 발생했습니다.') }
    finally { setDownloading(false) }
  }

  return <Layout title="주문 Export">
    <form onSubmit={(event) => void runPreview(event)} className="mb-5 rounded-xl bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Field label="시작일" type="date" value={filter.frDt} onChange={(value) => setFilter({ ...filter, frDt: value })} /><Field label="종료일" type="date" value={filter.toDt} onChange={(value) => setFilter({ ...filter, toDt: value })} />
        <Field label="채널" value={filter.channelCd} onChange={(value) => setFilter({ ...filter, channelCd: value })} /><Field label="쇼핑몰" value={filter.mallKey} onChange={(value) => setFilter({ ...filter, mallKey: value })} />
        <Field label="주문상태" value={filter.orderStatus} onChange={(value) => setFilter({ ...filter, orderStatus: value })} /><Field label="클레임상태" value={filter.claimStatus} onChange={(value) => setFilter({ ...filter, claimStatus: value })} /><Field label="배송상태" value={filter.deliveryStatus} onChange={(value) => setFilter({ ...filter, deliveryStatus: value })} />
      </div><div className="mt-4 flex justify-end gap-2"><button type="submit" disabled={loading} className="rounded-lg bg-slate-100 px-4 py-2 text-[12px] font-bold text-slate-700">{loading ? '조회 중...' : '미리보기'}</button><button type="button" onClick={() => void downloadExcel()} disabled={downloading} className="rounded-lg bg-[#3182F6] px-4 py-2 text-[12px] font-bold text-white">{downloading ? '생성 중...' : '엑셀 다운로드'}</button></div>
    </form>
    {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-[12px] text-red-600">{error}</div>}
    <section className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm"><div className="flex items-center justify-between border-b p-4"><h2 className="text-[14px] font-extrabold">미리보기</h2><span className="text-[12px] text-slate-500">전체 {preview?.totalCount ?? 0}행 · 미리보기 {preview?.previewCount ?? 0}행</span></div><div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-[11px]"><thead className="bg-slate-50"><tr>{['쇼핑몰','계정','주문번호','상품주문번호','주문일시','구매자','수령자','상품명','옵션','수량','결제금액','주문상태','클레임','배송상태'].map((head) => <th key={head} className="px-3 py-3 text-left">{head}</th>)}</tr></thead><tbody>{preview?.items.map((item) => <tr key={`${item.normalizedOrderId}:${item.orderItemNo}`} className="border-t"><Cell>{item.mallName}</Cell><Cell>{item.mallAccount}</Cell><Cell>{item.orderNo}</Cell><Cell>{item.orderItemNo}</Cell><Cell>{formatDate(item.orderDate)}</Cell><Cell>{item.buyerName}</Cell><Cell>{item.receiverName}</Cell><Cell>{item.productName}</Cell><Cell>{item.optionName}</Cell><Cell>{item.quantity ?? '-'}</Cell><Cell>{item.orderAmount?.toLocaleString() ?? '-'}</Cell><Cell>{item.orderStatus}</Cell><Cell>{item.claimStatus}</Cell><Cell>{item.deliveryStatus}</Cell></tr>)}</tbody></table></div>{!preview?.items.length && <div className="p-10 text-center text-[12px] text-slate-400">조회 조건을 입력하고 미리보기를 실행하세요.</div>}</section>
    <section className="overflow-hidden rounded-xl bg-white shadow-sm"><div className="border-b p-4"><h2 className="text-[14px] font-extrabold">최근 다운로드 이력</h2></div><table className="w-full text-[12px]"><thead className="bg-slate-50"><tr>{['Export ID','파일명','상태','행 수','생성일시','완료일시'].map((head) => <th key={head} className="px-4 py-3 text-left">{head}</th>)}</tr></thead><tbody>{history.map((item) => <tr key={item.exportId} className="border-t"><Cell>{item.exportId}</Cell><Cell>{item.fileName}</Cell><Cell>{item.status}</Cell><Cell>{item.totalCount}</Cell><Cell>{formatDate(item.createdAt)}</Cell><Cell>{formatDate(item.completedAt)}</Cell></tr>)}</tbody></table></section>
  </Layout>
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-[11px] font-bold text-slate-500">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-[12px]" /></label> }
function Cell({ children }: { children: ReactNode }) { return <td className="max-w-56 truncate px-3 py-3">{children}</td> }
function compactDate(value: string) { return value.split('-').join('') }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString() : '-' }
