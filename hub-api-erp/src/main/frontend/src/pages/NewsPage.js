import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
const PAGE_SIZE = 20;
const SOURCE_TABS = [
    { label: '전체', value: '' },
    { label: 'DART', value: 'DART' },
    { label: '뉴스', value: 'NAVER_RSS' },
];
export default function NewsPage() {
    const authenticatedFetch = useAuthenticatedFetch();
    const [source, setSource] = useState('');
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState('');
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const hasMore = items.length < total;
    const queryString = useMemo(() => {
        const params = new URLSearchParams();
        if (source)
            params.set('source', source);
        if (keyword)
            params.set('keyword', keyword);
        params.set('page', String(page));
        params.set('size', String(PAGE_SIZE));
        return params.toString();
    }, [source, keyword, page]);
    const fetchNews = useCallback(async (mode = 'replace') => {
        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch(`/api/hub/news?${queryString}`);
            if (!response.ok) {
                throw new Error(`뉴스 조회 실패 (${response.status})`);
            }
            const data = await response.json();
            setTotal(data.total);
            setItems((prev) => mode === 'append' ? [...prev, ...data.list] : data.list);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '뉴스를 불러오지 못했습니다.');
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch, queryString]);
    useEffect(() => {
        void fetchNews(page === 1 ? 'replace' : 'append');
    }, [fetchNews, page]);
    useEffect(() => {
        const id = setInterval(() => {
            if (page === 1) {
                void fetchNews('replace');
            }
        }, 30000);
        return () => clearInterval(id);
    }, [fetchNews, page]);
    function changeSource(nextSource) {
        setSource(nextSource);
        setPage(1);
        setItems([]);
    }
    function submitSearch() {
        setKeyword(keywordInput.trim());
        setPage(1);
        setItems([]);
    }
    function handleRefresh() {
        setPage(1);
        void fetchNews('replace');
    }
    return (_jsx(Layout, { title: "\uAE08\uC735\uC18D\uBCF4", actions: _jsx("button", { onClick: handleRefresh, disabled: loading, className: "px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40", children: "\uC0C8\uB85C\uACE0\uCE68" }), children: _jsxs("div", { className: "space-y-5", children: [_jsx("section", { className: "bg-white rounded-2xl shadow-sm border border-slate-100 p-5", children: _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("div", { className: "flex items-center gap-2", children: SOURCE_TABS.map((tab) => (_jsx("button", { onClick: () => changeSource(tab.value), className: `px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${source === tab.value
                                        ? 'bg-[#3182F6] text-white'
                                        : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200'}`, children: tab.label }, tab.label))) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { value: keywordInput, onChange: (event) => setKeywordInput(event.target.value), onKeyDown: (event) => {
                                            if (event.key === 'Enter')
                                                submitSearch();
                                        }, placeholder: "\uC81C\uBAA9 \uB610\uB294 \uD68C\uC0AC\uBA85 \uAC80\uC0C9", className: "w-64 px-3 py-2 text-[13px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#B0B8C1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" }), _jsx("button", { onClick: submitSearch, className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600", children: "\uAC80\uC0C9" })] })] }) }), error && (_jsx("div", { className: "rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600", children: error })), _jsx("section", { className: "space-y-3", children: items.length === 0 && loading ? (_jsx("div", { className: "bg-white rounded-2xl border border-slate-100 px-5 py-12 text-center text-[13px] text-[#8B95A1]", children: "\uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4." })) : items.length === 0 ? (_jsx("div", { className: "bg-white rounded-2xl border border-slate-100 px-5 py-12 text-center text-[13px] text-[#8B95A1]", children: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uAE08\uC735\uC18D\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) : (items.map((item) => _jsx(NewsCard, { item: item }, item.id))) }), hasMore && (_jsx("div", { className: "flex justify-center", children: _jsx("button", { onClick: () => setPage((prev) => prev + 1), disabled: loading, className: "px-5 py-2.5 text-[13px] font-bold rounded-xl bg-white border border-slate-200 text-[#4E5968] hover:bg-slate-50 disabled:opacity-40", children: loading ? '불러오는 중...' : '더보기' }) }))] }) }));
}
function NewsCard({ item }) {
    const sourceMeta = getSourceMeta(item.source);
    return (_jsx("article", { className: "bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 hover:border-blue-100 transition-colors", children: _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-center gap-2", children: [_jsx("span", { className: `px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold ${sourceMeta.className}`, children: sourceMeta.label }), item.category && (_jsx("span", { className: "px-2.5 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]", children: item.category })), item.source === 'DART' && item.corpName && (_jsx("span", { className: "text-[12px] font-bold text-[#8B95A1]", children: item.corpName }))] }), item.url ? (_jsx("a", { href: item.url, target: "_blank", rel: "noreferrer", className: "block text-[15px] font-extrabold text-[#191F28] hover:text-[#3182F6] line-clamp-2", children: item.title })) : (_jsx("h2", { className: "text-[15px] font-extrabold text-[#191F28] line-clamp-2", children: item.title })), item.summary && (_jsx("p", { className: "mt-2 text-[13px] leading-5 text-[#4E5968] line-clamp-2", children: item.summary }))] }), _jsx("time", { className: "shrink-0 text-[12px] font-semibold text-[#8B95A1]", children: item.publishedAt })] }) }));
}
function getSourceMeta(source) {
    if (source === 'DART') {
        return {
            label: 'DART',
            className: 'bg-blue-50 text-[#3182F6]',
        };
    }
    return {
        label: '뉴스',
        className: 'bg-emerald-50 text-emerald-600',
    };
}
