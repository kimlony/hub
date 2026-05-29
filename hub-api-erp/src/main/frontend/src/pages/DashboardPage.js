import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import CollectRequestModal from '../components/CollectRequestModal';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
const channelMeta = {
    '11ST': { label: '11번가', initial: '11', gradient: 'from-[#e8192c] to-[#ff6b6b]' },
    COUPANG: { label: '쿠팡', initial: 'C', gradient: 'from-[#ee2b2b] to-[#ff6060]' },
    GCHAN: { label: '선물찬스', initial: 'G', gradient: 'from-[#ff6f00] to-[#ffa040]' },
    NSS: { label: '네이버', initial: 'N', gradient: 'from-[#03c75a] to-[#3ddc97]' },
    GODO: { label: 'GODO', initial: 'GO', gradient: 'from-[#4f46e5] to-[#38bdf8]' },
};
export default function DashboardPage() {
    const [modalOpen, setModalOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const authenticatedFetch = useAuthenticatedFetch();
    const fetchDashboard = useCallback(async () => {
        setError('');
        try {
            const res = await authenticatedFetch('/api/hub/jobs/dashboard');
            if (!res.ok) {
                throw new Error(`Dashboard API failed: ${res.status}`);
            }
            setData(await res.json());
        }
        catch (err) {
            if (err.message !== 'Authentication required') {
                setError('대시보드 데이터를 불러오지 못했습니다.');
            }
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch]);
    useEffect(() => {
        void fetchDashboard();
    }, [fetchDashboard]);
    useEffect(() => {
        const id = setInterval(() => { void fetchDashboard(); }, 10000);
        return () => clearInterval(id);
    }, [fetchDashboard]);
    const statCards = useMemo(() => {
        const stats = data?.stats;
        return [
            {
                label: '오늘 수집 요청',
                value: formatNumber(stats?.todayTotal ?? 0),
                sub: `성공률 ${formatRate(stats?.todaySuccessRate ?? 0)}`,
                gradient: 'from-[#3182F6] to-[#5BABF9]',
            },
            {
                label: '성공',
                value: formatNumber(stats?.todaySuccess ?? 0),
                sub: '오늘 완료된 작업',
                gradient: 'from-[#00C073] to-[#3DDC97]',
            },
            {
                label: '실패',
                value: formatNumber(stats?.todayFailed ?? 0),
                sub: `재시도 대기 ${formatNumber(stats?.retryWaiting ?? 0)}건`,
                gradient: 'from-[#FF6B6B] to-[#FF9A9A]',
            },
            {
                label: '처리 중',
                value: formatNumber((stats?.queued ?? 0) + (stats?.processing ?? 0)),
                sub: `QUEUED ${formatNumber(stats?.queued ?? 0)} · PROC ${formatNumber(stats?.processing ?? 0)}`,
                gradient: 'from-amber-400 to-yellow-300',
            },
        ];
    }, [data]);
    const maxChannelCount = Math.max(...(data?.channelStats.map((ch) => ch.totalCount) ?? [0]), 1);
    return (_jsxs(_Fragment, { children: [modalOpen && _jsx(CollectRequestModal, { onClose: () => setModalOpen(false) }), _jsxs(Layout, { title: "\uB300\uC2DC\uBCF4\uB4DC", actions: _jsxs(_Fragment, { children: [_jsx("button", { onClick: () => { setLoading(true); void fetchDashboard(); }, className: "px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors", children: "\uC0C8\uB85C\uACE0\uCE68" }), _jsx("button", { onClick: () => setModalOpen(true), className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors", children: "+ \uC218\uC9D1 \uC694\uCCAD" })] }), children: [error && (_jsx("div", { className: "mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600", children: error })), _jsx("div", { className: "grid grid-cols-4 gap-4 mb-5", children: statCards.map((s) => (_jsxs("div", { className: `bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`, children: [_jsx("p", { className: "text-[12px] font-semibold opacity-85 mb-2", children: s.label }), _jsx("p", { className: "text-[28px] font-extrabold leading-none", children: loading && !data ? '-' : s.value }), _jsx("p", { className: "text-[11px] opacity-80 mt-1.5", children: s.sub })] }, s.label))) }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC \uC791\uC5C5" }), _jsx(Link, { to: "/jobs", className: "text-[12px] text-[#3182F6] font-semibold hover:underline", children: "\uC804\uCCB4 \uBCF4\uAE30" })] }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uAE30\uAC04" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0DD\uC131 \uC2DC\uAC01" })] }) }), _jsx("tbody", { children: data?.recentJobs.length ? data.recentJobs.map((job) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsx("td", { className: "px-5 py-2.5 text-[13px] font-bold text-[#191F28]", children: job.channelCd }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#4E5968]", children: formatPeriod(job.frDt, job.toDt) }), _jsx("td", { className: "px-5 py-2.5", children: _jsx(StatusBadge, { status: job.status }) }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#8B95A1]", children: formatDateTime(job.createdAt) })] }, job.requestId))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '아직 생성된 작업이 없습니다.' }) })) })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCC44\uB110\uBCC4 \uC218\uC9D1 \uD604\uD669" }) }), _jsx("div", { className: "divide-y divide-slate-50", children: data?.channelStats.length ? data.channelStats.map((ch) => {
                                            const meta = getChannelMeta(ch.channelCd);
                                            const pct = Math.max(4, Math.round((ch.totalCount / maxChannelCount) * 100));
                                            return (_jsxs("div", { className: "flex items-center gap-3 px-5 py-3", children: [_jsx("div", { className: `w-9 h-9 bg-gradient-to-br ${meta.gradient} rounded-lg flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0`, children: meta.initial }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex justify-between mb-1.5", children: [_jsx("span", { className: "text-[13px] font-bold text-[#191F28] truncate", children: meta.label }), _jsxs("span", { className: "text-[13px] font-bold text-[#191F28] ml-2 flex-shrink-0", children: [formatNumber(ch.totalCount), "\uAC74"] })] }), _jsx("div", { className: "h-1.5 bg-[#F2F4F6] rounded-full", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#5BABF9]", style: { width: `${pct}%` } }) }), _jsxs("p", { className: "mt-1.5 text-[11px] text-[#8B95A1]", children: ["\uC131\uACF5 ", formatNumber(ch.successCount), " \u00B7 \uC2E4\uD328 ", formatNumber(ch.failedCount), " \u00B7 \uC9C4\uD589 ", formatNumber(ch.processingCount + ch.queuedCount)] })] })] }, ch.channelCd));
                                        }) : (_jsx("div", { className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '채널별 수집 데이터가 없습니다.' })) })] })] })] })] }));
}
function getChannelMeta(channelCd) {
    return channelMeta[channelCd] ?? {
        label: channelCd,
        initial: channelCd.slice(0, 2).toUpperCase(),
        gradient: 'from-slate-500 to-slate-400',
    };
}
function formatNumber(value) {
    return new Intl.NumberFormat('ko-KR').format(value);
}
function formatRate(value) {
    return `${value.toFixed(1)}%`;
}
function formatPeriod(frDt, toDt) {
    if (!frDt && !toDt) {
        return '-';
    }
    return `${formatDate(frDt)} ~ ${formatDate(toDt)}`;
}
function formatDate(value) {
    if (/^\d{8}$/.test(value)) {
        return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
    }
    return value || '-';
}
function formatDateTime(value) {
    if (!value) {
        return '-';
    }
    return value.replace('T', ' ').slice(0, 16);
}
