import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type CollectedOrder = {
  requestId: string
  requestKey: string
  jobType: string
  sourceErp: string
  channelCd: string
  frDt: string
  toDt: string
  orderNo: string
  orderStatus: string
  orderDate: string
  receiverName: string
  productName: string
  quantity: number | null
  orderAmount: number | null
  rawOrder: string
  savedAt: string
}

type CollectedOrdersResponse = {
  responseCode: number
  orders: CollectedOrder[]
  total: number
  page: number
  size: number
  generatedAt: string
}

type ChannelInfo = {
  mallKey: string
  mallName: string
  registered: boolean
}

type Filters = {
  channelCd: string
  orderStatus: string
  keyword: string
  frDt: string
  toDt: string
}

const PAGE_SIZE = 30
const ORDER_STATUS_OPTIONS = [
  '결제대기', '주문접수', '결제완료', '주문완료', '상품준비중', '배송준비', '배송중', '배송완료',
  '구매확정', '취소접수', '취소완료', '반품접수', '반품완료', '교환접수', '교환중', '교환완료',
  '미결제취소', '상태확인필요'
]

const CHANNEL_COLORS: Record<string, string> = {
  '11ST': 'bg-red-50 text-red-700',
  COUPANG: 'bg-rose-50 text-rose-700',
  GCHAN: 'bg-orange-50 text-orange-700',
  WCHAN: 'bg-emerald-50 text-emerald-700',
  ONRY: 'bg-sky-50 text-sky-700',
  NSS: 'bg-green-50 text-green-700',
  GODO: 'bg-violet-50 text-violet-700',
  MOCK_MALL: 'bg-blue-50 text-blue-700',
}

const initialFilters: Filters = {
  channelCd: '',
  orderStatus: '',
  keyword: '',
  frDt: '',
  toDt: '',
}

export default function CollectedOrdersPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [data, setData] = useState<CollectedOrdersResponse | null>(null)
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [detailOrder, setDetailOrder] = useState<CollectedOrder | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        channelCd: filters.channelCd,
        orderStatus: filters.orderStatus,
        keyword: filters.keyword,
        frDt: toCompactDate(filters.frDt),
        toDt: toCompactDate(filters.toDt),
        page: String(page),
        size: String(PAGE_SIZE),
      })
      const response = await authenticatedFetch(`/api/hub/orders/export?${params}`)
      if (!response.ok) throw new Error('수집 주문을 불러오지 못했습니다.')
      setData(await response.json() as CollectedOrdersResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '수집 주문 조회 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, filters, page])

  useEffect(() => {
    void fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    async function fetchChannels() {
      try {
        const response = await authenticatedFetch('/api/channels')
        if (!response.ok) return
        setChannels(await response.json() as ChannelInfo[])
      } catch {
        setChannels([])
      }
    }
    void fetchChannels()
  }, [authenticatedFetch])

  const channelOptions = useMemo(() => {
    const unique = new Map<string, string>()
    channels.forEach((channel) => unique.set(channel.mallKey, channel.mallName))
    return [...unique.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [channels])

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageKeys = orders.map(orderKey)
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key))

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setFilters({ ...draftFilters })
    setSelectedKeys(new Set())
  }

  function resetFilters() {
    setDraftFilters(initialFilters)
    setFilters(initialFilters)
    setPage(1)
    setSelectedKeys(new Set())
  }

  function togglePageSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (allPageSelected) pageKeys.forEach((key) => next.delete(key))
      else pageKeys.forEach((key) => next.add(key))
      return next
    })
  }

  function toggleOrder(order: CollectedOrder) {
    const key = orderKey(order)
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Layout
      title="수집 주문"
      actions={
        <button
          type="button"
          onClick={() => void fetchOrders()}
          disabled={loading}
          className="rounded-lg bg-[#F2F4F6] px-3 py-2 text-[12px] font-bold text-[#4E5968] hover:bg-slate-200 disabled:opacity-50"
        >
          새로고침
        </button>
      }
    >
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}

      <form onSubmit={submitFilters} className="mb-4 flex flex-wrap items-end gap-3 border-b border-slate-200 pb-4">
        <FilterField label="채널">
          <select
            value={draftFilters.channelCd}
            onChange={(event) => setDraftFilters((current) => ({ ...current, channelCd: event.target.value }))}
            className="h-9 min-w-36 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-[#4E5968] outline-none focus:border-[#3182F6]"
          >
            <option value="">전체 채널</option>
            {channelOptions.map(([key, name]) => <option key={key} value={key}>{name} ({key})</option>)}
          </select>
        </FilterField>
        <FilterField label="주문 상태">
          <select
            value={draftFilters.orderStatus}
            onChange={(event) => setDraftFilters((current) => ({ ...current, orderStatus: event.target.value }))}
            className="h-9 min-w-36 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-[#4E5968] outline-none focus:border-[#3182F6]"
          >
            <option value="">전체 상태</option>
            {ORDER_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FilterField>
        <FilterField label="검색">
          <input
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            placeholder="주문번호, 구매자, 상품명"
            className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#3182F6]"
          />
        </FilterField>
        <FilterField label="주문 시작일">
          <input
            type="date"
            value={draftFilters.frDt}
            onChange={(event) => setDraftFilters((current) => ({ ...current, frDt: event.target.value }))}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#3182F6]"
          />
        </FilterField>
        <FilterField label="주문 종료일">
          <input
            type="date"
            value={draftFilters.toDt}
            onChange={(event) => setDraftFilters((current) => ({ ...current, toDt: event.target.value }))}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] outline-none focus:border-[#3182F6]"
          />
        </FilterField>
        <button type="submit" className="h-9 rounded-lg bg-[#3182F6] px-4 text-[12px] font-bold text-white hover:bg-blue-600">
          조회
        </button>
        <button type="button" onClick={resetFilters} className="h-9 rounded-lg bg-white px-4 text-[12px] font-bold text-[#4E5968] ring-1 ring-slate-200 hover:bg-slate-50">
          초기화
        </button>
      </form>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px] text-[#8B95A1]">
          <span>전체 <strong className="text-[#191F28]">{total.toLocaleString()}</strong>건</span>
          <span className="h-3 w-px bg-slate-200" />
          <span>선택 <strong className="text-[#3182F6]">{selectedKeys.size}</strong>건</span>
        </div>
        <span className="text-[11px] text-[#8B95A1]">페이지당 {PAGE_SIZE}건</span>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full table-fixed">
            <thead className="bg-[#F8FAFC]">
              <tr className="border-b border-slate-200">
                <th className="w-12 px-4 py-3 text-center">
                  <input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="현재 페이지 전체 선택" className="h-4 w-4 accent-[#3182F6]" />
                </th>
                <GridHead className="w-24">채널</GridHead>
                <GridHead className="w-44">주문번호</GridHead>
                <GridHead className="w-36">상태</GridHead>
                <GridHead className="w-36">주문일시</GridHead>
                <GridHead className="w-56">상품</GridHead>
                <GridHead className="w-20 text-right">수량</GridHead>
                <GridHead className="w-32">수령인</GridHead>
                <GridHead className="w-32 text-right">주문금액</GridHead>
                <GridHead className="w-40">수집일시</GridHead>
                <GridHead className="w-20 text-center">상세</GridHead>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <EmptyRow message="수집 주문을 불러오는 중입니다." />
              ) : error ? (
                <EmptyRow message={error} error />
              ) : orders.length === 0 ? (
                <EmptyRow message="조건에 해당하는 수집 주문이 없습니다." />
              ) : orders.map((order) => {
                const key = orderKey(order)
                return (
                  <tr key={key} className={`border-b border-slate-100 last:border-0 hover:bg-blue-50/30 ${selectedKeys.has(key) ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleOrder(order)} aria-label={`${order.orderNo} 선택`} className="h-4 w-4 accent-[#3182F6]" />
                    </td>
                    <td className="px-3 py-3"><ChannelBadge channelCd={order.channelCd} /></td>
                    <td className="truncate px-3 py-3 font-mono text-[12px] font-bold text-[#191F28]" title={order.orderNo}>{order.orderNo || '-'}</td>
                    <td className="px-3 py-3"><OrderStatus status={order.orderStatus} /></td>
                    <td className="px-3 py-3 text-[12px] text-[#4E5968]">{formatOrderDate(order.orderDate)}</td>
                    <td className="truncate px-3 py-3 text-[12px] font-semibold text-[#4E5968]" title={order.productName}>{order.productName || '-'}</td>
                    <td className="px-3 py-3 text-right text-[12px] text-[#4E5968]">{order.quantity?.toLocaleString() ?? '-'}</td>
                    <td className="truncate px-3 py-3 text-[12px] text-[#4E5968]" title={order.receiverName}>{order.receiverName || '-'}</td>
                    <td className="px-3 py-3 text-right text-[12px] font-bold text-[#191F28]">{formatAmount(order.orderAmount)}</td>
                    <td className="px-3 py-3 text-[12px] text-[#8B95A1]">{order.savedAt || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <button type="button" onClick={() => setDetailOrder(order)} className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-[#4E5968] hover:bg-slate-200">보기</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-[12px] text-[#8B95A1]">{page} / {totalPages} 페이지</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-bold text-[#4E5968] disabled:opacity-40">이전</button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-lg bg-[#F2F4F6] px-3 py-1.5 text-[12px] font-bold text-[#4E5968] disabled:opacity-40">다음</button>
          </div>
        </div>
      </section>
    </Layout>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-[11px] font-bold text-[#8B95A1]"><span>{label}</span>{children}</label>
}

function GridHead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-3 text-left text-[11px] font-bold text-[#8B95A1] ${className}`}>{children}</th>
}

function EmptyRow({ message, error = false }: { message: string; error?: boolean }) {
  return <tr><td colSpan={11} className={`px-6 py-16 text-center text-[13px] ${error ? 'text-red-600' : 'text-[#8B95A1]'}`}>{message}</td></tr>
}

function ChannelBadge({ channelCd }: { channelCd: string }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-extrabold ${CHANNEL_COLORS[channelCd] ?? 'bg-slate-100 text-slate-700'}`}>{channelCd}</span>
}

function OrderStatus({ status }: { status: string }) {
  const normalized = status?.toUpperCase() ?? ''
  const color = normalized.includes('CANCEL') || normalized.includes('FAIL') || normalized.includes('취소')
    ? 'bg-red-50 text-red-700'
    : normalized.includes('DELIVER') || normalized.includes('SUCCESS') || normalized.includes('완료')
      ? 'bg-emerald-50 text-emerald-700'
      : normalized.includes('SHIP') || normalized.includes('배송')
        ? 'bg-blue-50 text-blue-700'
        : 'bg-amber-50 text-amber-700'
  return <span className={`inline-flex max-w-full truncate rounded-md px-2 py-1 text-[10px] font-bold ${color}`} title={status}>{status || '-'}</span>
}

function OrderDetailModal({ order, onClose }: { order: CollectedOrder; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="상세 닫기" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative max-h-[88vh] w-[920px] max-w-full overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><ChannelBadge channelCd={order.channelCd} /><h2 className="truncate font-mono text-[15px] font-extrabold text-[#191F28]">{order.orderNo}</h2></div>
            <p className="mt-1 text-[11px] text-[#8B95A1]">Request {order.requestId}</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 text-[20px] font-bold text-[#8B95A1] hover:text-[#191F28]" aria-label="닫기">×</button>
        </div>
        <div className="max-h-[calc(88vh-73px)] overflow-auto p-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
            <DetailValue label="주문 상태" value={order.orderStatus || '-'} />
            <DetailValue label="주문 일시" value={formatOrderDate(order.orderDate)} />
            <DetailValue label="주문 금액" value={formatAmount(order.orderAmount)} />
            <DetailValue label="수집 일시" value={order.savedAt || '-'} />
            <DetailValue label="상품명" value={order.productName || '-'} />
            <DetailValue label="수량" value={order.quantity?.toLocaleString() ?? '-'} />
            <DetailValue label="수령인" value={order.receiverName || '-'} />
            <DetailValue label="ERP" value={order.sourceErp || '-'} />
          </dl>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="mb-3 text-[12px] font-extrabold text-[#191F28]">원본 주문 데이터</h3>
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-[#111827] p-4 text-[11px] leading-5 text-slate-200">{formatRawOrder(order.rawOrder)}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold text-[#8B95A1]">{label}</dt><dd className="mt-1 break-words text-[12px] font-semibold text-[#191F28]">{value}</dd></div>
}

function orderKey(order: CollectedOrder): string {
  return `${order.requestId}:${order.channelCd}:${order.orderNo}`
}

function toCompactDate(value: string): string {
  return value.split('-').join('')
}

function formatOrderDate(value: string): string {
  if (!value || value.length < 8) return '-'
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  if (value.length < 14) return date
  return `${date} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`
}

function formatAmount(value: number | null): string {
  return value === null ? '-' : `${value.toLocaleString()}원`
}

function formatRawOrder(value: string): string {
  if (!value) return '{}'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
