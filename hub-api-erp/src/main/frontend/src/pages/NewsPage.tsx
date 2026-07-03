import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch'

type NewsSource = '' | 'DART' | 'NAVER_RSS'

type NewsItem = {
  id: number
  source: string
  category?: string | null
  title: string
  summary?: string | null
  url?: string | null
  corpName?: string | null
  publishedAt: string
}

type NewsResponse = {
  total: number
  list: NewsItem[]
  page: number
  size: number
}

const PAGE_SIZE = 20

const SOURCE_TABS: Array<{ label: string; value: NewsSource }> = [
  { label: '전체', value: '' },
  { label: 'DART', value: 'DART' },
  { label: '뉴스', value: 'NAVER_RSS' },
]

export default function NewsPage() {
  const authenticatedFetch = useAuthenticatedFetch()
  const [source, setSource] = useState<NewsSource>('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<NewsItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMore = items.length < total

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (source) params.set('source', source)
    if (keyword) params.set('keyword', keyword)
    params.set('page', String(page))
    params.set('size', String(PAGE_SIZE))
    return params.toString()
  }, [source, keyword, page])

  const fetchNews = useCallback(async (mode: 'replace' | 'append' = 'replace') => {
    setLoading(true)
    setError(null)
    try {
      const response = await authenticatedFetch(`/api/hub/news?${queryString}`)
      if (!response.ok) {
        throw new Error(`뉴스 조회 실패 (${response.status})`)
      }
      const data = await response.json() as NewsResponse
      setTotal(data.total)
      setItems((prev) => mode === 'append' ? [...prev, ...data.list] : data.list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '뉴스를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [authenticatedFetch, queryString])

  useEffect(() => {
    void fetchNews(page === 1 ? 'replace' : 'append')
  }, [fetchNews, page])

  useEffect(() => {
    const id = setInterval(() => {
      if (page === 1) {
        void fetchNews('replace')
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [fetchNews, page])

  function changeSource(nextSource: NewsSource) {
    setSource(nextSource)
    setPage(1)
    setItems([])
  }

  function submitSearch() {
    setKeyword(keywordInput.trim())
    setPage(1)
    setItems([])
  }

  function handleRefresh() {
    setPage(1)
    void fetchNews('replace')
  }


  return (
    <Layout
      title="금융속보"
      actions={
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40"
        >
          새로고침
        </button>
      }
    >
      <div className="space-y-5">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {SOURCE_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => changeSource(tab.value)}
                  className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${
                    source === tab.value
                      ? 'bg-[#3182F6] text-white'
                      : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitSearch()
                }}
                placeholder="제목 또는 회사명 검색"
                className="w-64 px-3 py-2 text-[13px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
              />
              <button
                onClick={submitSearch}
                className="px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600"
              >
                검색
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
            {error}
          </div>
        )}

        <section className="space-y-3">
          {items.length === 0 && loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-12 text-center text-[13px] text-[#8B95A1]">
              불러오는 중입니다.
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-12 text-center text-[13px] text-[#8B95A1]">
              조건에 맞는 금융속보가 없습니다.
            </div>
          ) : (
            items.map((item) => <NewsCard key={item.id} item={item} />)
          )}
        </section>

        {hasMore && (
          <div className="flex justify-center">
            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={loading}
              className="px-5 py-2.5 text-[13px] font-bold rounded-xl bg-white border border-slate-200 text-[#4E5968] hover:bg-slate-50 disabled:opacity-40"
            >
              {loading ? '불러오는 중...' : '더보기'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

function NewsCard({ item }: { item: NewsItem }) {
  const sourceMeta = getSourceMeta(item.source)

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 hover:border-blue-100 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold ${sourceMeta.className}`}>
              {sourceMeta.label}
            </span>
            {item.category && (
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]">
                {item.category}
              </span>
            )}
            {item.source === 'DART' && item.corpName && (
              <span className="text-[12px] font-bold text-[#8B95A1]">
                {item.corpName}
              </span>
            )}
          </div>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block text-[15px] font-extrabold text-[#191F28] hover:text-[#3182F6] line-clamp-2"
            >
              {item.title}
            </a>
          ) : (
            <h2 className="text-[15px] font-extrabold text-[#191F28] line-clamp-2">{item.title}</h2>
          )}
          {item.summary && (
            <p className="mt-2 text-[13px] leading-5 text-[#4E5968] line-clamp-2">
              {item.summary}
            </p>
          )}
        </div>
        <time className="shrink-0 text-[12px] font-semibold text-[#8B95A1]">
          {item.publishedAt}
        </time>
      </div>
    </article>
  )
}

function getSourceMeta(source: string) {
  if (source === 'DART') {
    return {
      label: 'DART',
      className: 'bg-blue-50 text-[#3182F6]',
    }
  }
  return {
    label: '뉴스',
    className: 'bg-emerald-50 text-emerald-600',
  }
}
