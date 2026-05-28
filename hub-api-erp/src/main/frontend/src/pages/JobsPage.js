import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import CollectRequestModal from '../components/CollectRequestModal';
import { useAuth } from '../context/AuthContext';
const CHANNEL_COLORS = {
    '11ST': 'bg-red-50 text-red-600',
    GCHAN: 'bg-orange-50 text-orange-600',
    COUPANG: 'bg-rose-50 text-rose-700',
    NSS: 'bg-[#E8FAF0] text-[#00C073]',
};
const PAGE_SIZE = 20;
function formatPeriod(frDt, toDt) {
    if (!frDt || !toDt)
        return '-';
    const fmt = (d) => `${d.slice(4, 6)}/${d.slice(6, 8)}`;
    return frDt === toDt ? fmt(frDt) : `${fmt(frDt)} ~ ${fmt(toDt)}`;
}
function formatCreatedAt(iso) {
    if (!iso)
        return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('ko-KR', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        });
    }
    catch {
        return iso;
    }
}
export default function JobsPage() {
    const { token } = useAuth();
    const [statusFilter, setStatusFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                status: statusFilter,
                channelCd: channelFilter,
                page: String(page),
                size: String(PAGE_SIZE),
            });
            const res = await fetch(`/api/hub/jobs?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                throw new Error('목록 조회 실패');
            setData(await res.json());
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setLoading(false);
        }
    }, [token, statusFilter, channelFilter, page]);
    // 필터·페이지 변경 시 재조회
    useEffect(() => {
        void fetchJobs();
    }, [fetchJobs]);
    // 10초마다 자동 새로고침 (QUEUED/PROCESSING 상태 추적)
    useEffect(() => {
        const id = setInterval(() => { void fetchJobs(); }, 10000);
        return () => clearInterval(id);
    }, [fetchJobs]);
    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };
    const handleRetry = async (requestId) => {
        try {
            const res = await fetch(`/api/hub/jobs/${requestId}/retry`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                throw new Error('재시도 요청 실패');
            await fetchJobs();
        }
        catch (e) {
            console.error(e);
            alert('재시도 요청에 실패했습니다.');
        }
    };
    const jobs = data?.jobs ?? [];
    const totalCount = data?.totalCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    return (_jsxs(_Fragment, { children: [modalOpen && (_jsx(CollectRequestModal, { onClose: () => {
                    setModalOpen(false);
                    void fetchJobs();
                } })), _jsx(Layout, { title: "\uC791\uC5C5 \uBAA9\uB85D", actions: _jsxs(_Fragment, { children: [_jsxs("select", { value: statusFilter, onChange: handleFilterChange(setStatusFilter), className: "px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30", children: [_jsx("option", { value: "", children: "\uC804\uCCB4 \uC0C1\uD0DC" }), _jsx("option", { children: "QUEUED" }), _jsx("option", { children: "PROCESSING" }), _jsx("option", { children: "SUCCESS" }), _jsx("option", { children: "FAILED" })] }), _jsxs("select", { value: channelFilter, onChange: handleFilterChange(setChannelFilter), className: "px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30", children: [_jsx("option", { value: "", children: "\uC804\uCCB4 \uCC44\uB110" }), _jsx("option", { children: "11ST" }), _jsx("option", { children: "GCHAN" }), _jsx("option", { children: "COUPANG" }), _jsx("option", { children: "NSS" })] }), _jsx("button", { onClick: () => setModalOpen(true), className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors", children: "+ \uC218\uC9D1 \uC694\uCCAD" })] }), children: _jsxs("div", { className: "bg-white rounded-2xl shadow-sm overflow-hidden", children: [_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA] border-b border-slate-100", children: [_jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Request ID" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC218\uC9D1 \uAE30\uAC04" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC7AC\uC2DC\uB3C4" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0DD\uC131 \uC2DC\uAC01" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC561\uC158" })] }) }), _jsx("tbody", { children: loading && jobs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-12 text-center text-[#8B95A1] text-[13px]", children: "\uBD88\uB7EC\uC624\uB294 \uC911..." }) })) : jobs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-12 text-center text-[#8B95A1] text-[13px]", children: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) : (jobs.map((j) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsxs("td", { className: "px-5 py-3 font-mono text-[#8B95A1] text-[11px]", children: [j.requestId.slice(0, 8), "..."] }), _jsx("td", { className: "px-5 py-3", children: _jsx("span", { className: `px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${CHANNEL_COLORS[j.channelCd] ?? 'bg-slate-100 text-slate-600'}`, children: j.channelCd }) }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: formatPeriod(j.frDt, j.toDt) }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusBadge, { status: j.status }) }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#8B95A1]", children: j.retryCount }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#8B95A1]", children: formatCreatedAt(j.createdAt) }), _jsx("td", { className: "px-5 py-3", children: j.status === 'FAILED' ? (_jsx("button", { onClick: () => void handleRetry(j.requestId), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-[#FF6B6B] hover:bg-red-100 transition-colors", children: "\uC7AC\uC2DC\uB3C4" })) : (_jsx("span", { className: "px-3 py-1.5 text-[12px] text-[#C5C8CE]", children: "-" })) })] }, j.requestId)))) })] }), _jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-t border-slate-100", children: [_jsxs("span", { className: "text-[13px] text-[#8B95A1]", children: ["\uCD1D ", totalCount, "\uAC74"] }), _jsxs("div", { className: "flex gap-1.5", children: [_jsx("button", { onClick: () => setPage((p) => Math.max(1, p - 1)), disabled: page === 1, className: "px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors", children: "\uC774\uC804" }), Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                                            const p = startPage + i;
                                            return (_jsx("button", { onClick: () => setPage(p), className: `px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${p === page
                                                    ? 'bg-[#3182F6] text-white'
                                                    : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200'}`, children: p }, p));
                                        }), _jsx("button", { onClick: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: page === totalPages, className: "px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors", children: "\uB2E4\uC74C" })] })] })] }) })] }));
}
