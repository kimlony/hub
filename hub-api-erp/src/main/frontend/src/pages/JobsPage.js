import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import CollectRequestModal from '../components/CollectRequestModal';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
const CHANNEL_COLORS = {
    '11ST': 'bg-red-50 text-red-600',
    GCHAN: 'bg-orange-50 text-orange-600',
    COUPANG: 'bg-rose-50 text-rose-700',
    NSS: 'bg-[#E8FAF0] text-[#00C073]',
};
const LOG_LEVEL_COLORS = {
    INFO: 'bg-blue-50 text-blue-700',
    WARN: 'bg-amber-50 text-amber-700',
    ERROR: 'bg-red-50 text-red-700',
};
const PAGE_SIZE = 20;
function formatPeriod(frDt, toDt) {
    if (!frDt || !toDt)
        return '-';
    const fmt = (d) => `${d.slice(4, 6)}/${d.slice(6, 8)}`;
    return frDt === toDt ? fmt(frDt) : `${fmt(frDt)} ~ ${fmt(toDt)}`;
}
function formatDateTime(iso) {
    if (!iso)
        return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    }
    catch {
        return iso;
    }
}
function formatDetail(detail) {
    if (!detail)
        return '';
    try {
        return JSON.stringify(JSON.parse(detail), null, 2);
    }
    catch {
        return detail;
    }
}
export default function JobsPage() {
    const authenticatedFetch = useAuthenticatedFetch();
    const [statusFilter, setStatusFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [logRequestId, setLogRequestId] = useState(null);
    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                status: statusFilter,
                channelCd: channelFilter,
                page: String(page),
                size: String(PAGE_SIZE),
            });
            const res = await authenticatedFetch(`/api/hub/jobs?${params}`);
            if (!res.ok)
                throw new Error('작업 목록 조회 실패');
            setData(await res.json());
        }
        catch (e) {
            console.error(e);
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch, statusFilter, channelFilter, page]);
    useEffect(() => {
        void fetchJobs();
    }, [fetchJobs]);
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
            const res = await authenticatedFetch(`/api/hub/jobs/${requestId}/retry`, {
                method: 'POST',
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
                } })), logRequestId && (_jsx(JobLogModal, { requestId: logRequestId, onClose: () => setLogRequestId(null) })), _jsx(Layout, { title: "\uC791\uC5C5 \uBAA9\uB85D", actions: _jsxs(_Fragment, { children: [_jsxs("select", { value: statusFilter, onChange: handleFilterChange(setStatusFilter), className: "px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30", children: [_jsx("option", { value: "", children: "\uC804\uCCB4 \uC0C1\uD0DC" }), _jsx("option", { children: "QUEUED" }), _jsx("option", { children: "PROCESSING" }), _jsx("option", { children: "SUCCESS" }), _jsx("option", { children: "FAILED" })] }), _jsxs("select", { value: channelFilter, onChange: handleFilterChange(setChannelFilter), className: "px-3 py-2 text-[13px] font-medium border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30", children: [_jsx("option", { value: "", children: "\uC804\uCCB4 \uCC44\uB110" }), _jsx("option", { children: "11ST" }), _jsx("option", { children: "GCHAN" }), _jsx("option", { children: "COUPANG" }), _jsx("option", { children: "NSS" })] }), _jsx("button", { onClick: () => setModalOpen(true), className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors", children: "+ \uC218\uC9D1 \uC694\uCCAD" })] }), children: _jsxs("div", { className: "bg-white rounded-2xl shadow-sm overflow-hidden", children: [_jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA] border-b border-slate-100", children: [_jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Request ID" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC218\uC9D1 \uAE30\uAC04" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC7AC\uC2DC\uB3C4" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0DD\uC131 \uC2DC\uAC01" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC561\uC158" })] }) }), _jsx("tbody", { children: loading && jobs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-12 text-center text-[#8B95A1] text-[13px]", children: "\uBD88\uB7EC\uC624\uB294 \uC911..." }) })) : jobs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-12 text-center text-[#8B95A1] text-[13px]", children: "\uC870\uAC74\uC5D0 \uB9DE\uB294 \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) : (jobs.map((j) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsxs("td", { className: "px-5 py-3 font-mono text-[#8B95A1] text-[11px]", children: [j.requestId.slice(0, 8), "..."] }), _jsx("td", { className: "px-5 py-3", children: _jsx("span", { className: `px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${CHANNEL_COLORS[j.channelCd] ?? 'bg-slate-100 text-slate-600'}`, children: j.channelCd }) }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: formatPeriod(j.frDt, j.toDt) }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusBadge, { status: j.status }) }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#8B95A1]", children: j.retryCount }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#8B95A1]", children: formatDateTime(j.createdAt) }), _jsx("td", { className: "px-5 py-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => setLogRequestId(j.requestId), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200 transition-colors", children: "LOG \uBCF4\uAE30" }), j.status === 'FAILED' && (_jsx("button", { onClick: () => void handleRetry(j.requestId), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-[#FF6B6B] hover:bg-red-100 transition-colors", children: "\uC7AC\uC2DC\uB3C4" }))] }) })] }, j.requestId)))) })] }), _jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-t border-slate-100", children: [_jsxs("span", { className: "text-[13px] text-[#8B95A1]", children: ["\uCD1D ", totalCount, "\uAC74"] }), _jsxs("div", { className: "flex gap-1.5", children: [_jsx("button", { onClick: () => setPage((p) => Math.max(1, p - 1)), disabled: page === 1, className: "px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors", children: "\uC774\uC804" }), Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                                            const p = startPage + i;
                                            return (_jsx("button", { onClick: () => setPage(p), className: `px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${p === page
                                                    ? 'bg-[#3182F6] text-white'
                                                    : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200'}`, children: p }, p));
                                        }), _jsx("button", { onClick: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: page === totalPages, className: "px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 disabled:opacity-40 transition-colors", children: "\uB2E4\uC74C" })] })] })] }) })] }));
}
function JobLogModal({ requestId, onClose }) {
    const authenticatedFetch = useAuthenticatedFetch();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        let mounted = true;
        async function fetchLogs() {
            setLoading(true);
            setError(null);
            try {
                const res = await authenticatedFetch(`/api/hub/jobs/${requestId}/logs`);
                if (!res.ok)
                    throw new Error('로그 조회 실패');
                const body = await res.json();
                if (mounted)
                    setLogs(body.logs);
            }
            catch (e) {
                if (mounted)
                    setError(e instanceof Error ? e.message : '로그 조회 중 오류가 발생했습니다.');
            }
            finally {
                if (mounted)
                    setLoading(false);
            }
        }
        void fetchLogs();
        return () => { mounted = false; };
    }, [requestId, authenticatedFetch]);
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-black/30", onClick: onClose }), _jsxs("div", { className: "relative w-[920px] max-w-[calc(100vw-32px)] max-h-[82vh] bg-white rounded-2xl shadow-xl overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-slate-100", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "Job \uB85C\uADF8" }), _jsx("p", { className: "mt-1 font-mono text-[11px] text-[#8B95A1]", children: requestId })] }), _jsx("button", { onClick: onClose, className: "text-[#8B95A1] hover:text-[#4E5968] text-[22px] leading-none", children: "x" })] }), _jsx("div", { className: "p-6 overflow-auto max-h-[calc(82vh-73px)]", children: loading ? (_jsx("div", { className: "py-12 text-center text-[13px] text-[#8B95A1]", children: "\uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294 \uC911..." })) : error ? (_jsx("div", { className: "py-12 text-center text-[13px] text-red-500", children: error })) : logs.length === 0 ? (_jsx("div", { className: "py-12 text-center text-[13px] text-[#8B95A1]", children: "\uC800\uC7A5\uB41C \uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) : (_jsx("div", { className: "space-y-3", children: logs.map((log) => (_jsxs("div", { className: "border border-slate-100 rounded-xl p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `px-2 py-0.5 rounded-lg text-[11px] font-bold ${LOG_LEVEL_COLORS[log.level] ?? 'bg-slate-100 text-slate-600'}`, children: log.level }), _jsx("span", { className: "font-mono text-[12px] font-bold text-[#191F28]", children: log.eventType })] }), _jsx("p", { className: "mt-2 text-[13px] text-[#4E5968]", children: log.message }), log.errorMessage && (_jsx("p", { className: "mt-2 text-[12px] text-red-600 break-words", children: log.errorMessage }))] }), _jsx("span", { className: "shrink-0 text-[12px] text-[#8B95A1]", children: formatDateTime(log.createdAt) })] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2 text-[11px] text-[#8B95A1]", children: [log.channelCd && _jsxs("span", { className: "px-2 py-1 rounded-lg bg-slate-50", children: ["channel: ", log.channelCd] }), log.mallKey && _jsxs("span", { className: "px-2 py-1 rounded-lg bg-slate-50", children: ["mall: ", log.mallKey] }), log.retryCount !== null && (_jsxs("span", { className: "px-2 py-1 rounded-lg bg-slate-50", children: ["retry: ", log.retryCount, "/", log.maxRetryCount ?? '-'] }))] }), log.detail && log.detail !== '{}' && (_jsx("pre", { className: "mt-3 max-h-40 overflow-auto rounded-xl bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#4E5968]", children: formatDetail(log.detail) }))] }, log.id))) })) })] })] }), document.body);
}
