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
    const [notices, setNotices] = useState([]);
    const [performance, setPerformance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const authenticatedFetch = useAuthenticatedFetch();
    const fetchDashboard = useCallback(async () => {
        setError('');
        try {
            const [res, noticeRes] = await Promise.all([
                authenticatedFetch('/api/hub/jobs/dashboard'),
                authenticatedFetch('/api/hub/notices/active'),
            ]);
            if (!res.ok) {
                throw new Error(`Dashboard API failed: ${res.status}`);
            }
            const dashboardBody = await res.json();
            setData(dashboardBody);
            setPerformance(dashboardBody.performance);
            if (noticeRes.ok) {
                const noticeBody = await noticeRes.json();
                setNotices(noticeBody.notices);
            }
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
    const performancePoints = performance?.points ?? [];
    return (_jsxs(_Fragment, { children: [modalOpen && _jsx(CollectRequestModal, { onClose: () => setModalOpen(false) }), _jsxs(Layout, { title: "\uB300\uC2DC\uBCF4\uB4DC", actions: _jsxs(_Fragment, { children: [_jsx("button", { onClick: () => { setLoading(true); void fetchDashboard(); }, className: "px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors", children: "\uC0C8\uB85C\uACE0\uCE68" }), _jsx("button", { onClick: () => setModalOpen(true), className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors", children: "+ \uC218\uC9D1 \uC694\uCCAD" })] }), children: [error && (_jsx("div", { className: "mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600", children: error })), notices.length > 0 && (_jsx("div", { className: "mb-4 space-y-2", children: notices.map((notice) => (_jsx("div", { className: "rounded-lg border border-amber-100 bg-amber-50 px-4 py-3", children: _jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[13px] font-extrabold text-amber-800", children: notice.title }), _jsx("p", { className: "mt-1 text-[13px] font-medium text-amber-700", children: notice.message }), notice.reason && (_jsx("p", { className: "mt-1 text-[11px] text-amber-600 line-clamp-1", children: notice.reason }))] }), _jsxs("span", { className: "shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700", children: [notice.failureCount, " failures"] })] }) }, notice.id))) })), _jsx("div", { className: "grid grid-cols-4 gap-4 mb-5", children: statCards.map((s) => (_jsxs("div", { className: `bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`, children: [_jsx("p", { className: "text-[12px] font-semibold opacity-85 mb-2", children: s.label }), _jsx("p", { className: "text-[28px] font-extrabold leading-none", children: loading && !data ? '-' : s.value }), _jsx("p", { className: "text-[11px] opacity-80 mt-1.5", children: s.sub })] }, s.label))) }), _jsxs("div", { className: "grid grid-cols-[360px_1fr] gap-4 mb-5", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-50", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCC98\uB9AC\uC2DC\uAC04 \uC9C0\uD45C" }), _jsxs("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: ["\uCD5C\uADFC ", performance?.minutes ?? 60, "\uBD84 \uAE30\uC900"] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 p-5", children: [_jsx(MetricBox, { label: "\uD3C9\uADE0", value: formatDuration(performance?.summary.avgDurationMs ?? 0) }), _jsx(MetricBox, { label: "P95", value: formatDuration(performance?.summary.p95DurationMs ?? 0) }), _jsx(MetricBox, { label: "\uCD5C\uB300", value: formatDuration(performance?.summary.maxDurationMs ?? 0) }), _jsx(MetricBox, { label: "\uBD84\uB2F9 \uC644\uB8CC", value: `${formatDecimal(performance?.summary.throughputPerMinute ?? 0)}/m` })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCC98\uB9AC\uB7C9 / \uC9C0\uC5F0\uC2DC\uAC04 \uADF8\uB798\uD504" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uC644\uB8CC \uAC74\uC218\uC640 P95 \uCC98\uB9AC\uC2DC\uAC04\uC744 \uD568\uAED8 \uD655\uC778" })] }), _jsxs("div", { className: "text-[12px] text-[#8B95A1]", children: ["\uC644\uB8CC ", formatNumber(performance?.summary.completedJobs ?? 0), " \u00B7 \uC2E4\uD328 ", formatNumber(performance?.summary.failedJobs ?? 0)] })] }), _jsx("div", { className: "p-5", children: _jsx("div", { className: "h-[260px]", children: _jsx(LatencyLineChart, { points: performancePoints }) }) })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden mb-5", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "Worker\uBCC4 \uCC98\uB9AC \uC131\uB2A5" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uCD5C\uADFC 60\uBD84 \uAE30\uC900\uC73C\uB85C worker\uBCC4 \uCC98\uB9AC\uB7C9\uACFC \uC9C0\uC5F0\uC2DC\uAC04 \uBD84\uD3EC\uB97C \uBE44\uAD50\uD569\uB2C8\uB2E4." })] }), _jsxs("span", { className: "rounded-full bg-[#F8FAFC] px-3 py-1 text-[12px] font-bold text-[#4E5968]", children: [formatNumber(data?.workerPerformance.length ?? 0), " workers"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[920px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Worker" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Source" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Completed" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Success" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Failed" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Avg" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "P95" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Throughput" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Last" })] }) }), _jsx("tbody", { children: data?.workerPerformance.length ? data.workerPerformance.map((worker) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsxs("td", { className: "px-5 py-2.5", children: [_jsx("p", { className: "text-[12px] font-bold text-[#191F28]", children: shortWorkerId(worker.workerInstanceId) }), _jsx("p", { className: "mt-0.5 text-[11px] text-[#8B95A1] line-clamp-1", children: worker.kafkaClientId || worker.workerInstanceId })] }), _jsx("td", { className: "px-5 py-2.5", children: _jsx("span", { className: "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-[#4E5968]", children: worker.source }) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-bold text-[#191F28]", children: formatNumber(worker.completedJobs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-semibold text-[#00A661]", children: formatNumber(worker.successJobs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-semibold text-[#E5484D]", children: formatNumber(worker.failedJobs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] text-[#4E5968]", children: formatDuration(worker.avgDurationMs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-bold text-[#F97316]", children: formatDuration(worker.p95DurationMs) }), _jsxs("td", { className: "px-5 py-2.5 text-right text-[12px] text-[#4E5968]", children: [formatDecimal(worker.throughputPerMinute), "/m"] }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#8B95A1]", children: formatDateTime(worker.lastCompletedAt) })] }, `${worker.workerInstanceId}-${worker.source}`))) : (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '최근 완료된 worker 처리 이력이 없습니다.' }) })) })] }) })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden mb-5", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC \uBD80\uD558\uD14C\uC2A4\uD2B8 \uB9AC\uD3EC\uD2B8" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uC2E4\uD589 \uC870\uAC74\uACFC \uCC98\uB9AC \uACB0\uACFC\uB97C \uC800\uC7A5\uD574\uC11C \uD14C\uC2A4\uD2B8\uBCC4 \uC131\uB2A5\uC744 \uBE44\uAD50\uD569\uB2C8\uB2E4." })] }), _jsxs("span", { className: "rounded-full bg-[#EFF6FF] px-3 py-1 text-[12px] font-bold text-[#3182F6]", children: [formatNumber(data?.loadTestRuns.length ?? 0), " runs"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[980px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Run" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Mode" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Jobs" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Success" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Failed" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Avg" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "P95" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Throughput" }), _jsx("th", { className: "px-5 py-2.5 text-right text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Elapsed" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Created" })] }) }), _jsx("tbody", { children: data?.loadTestRuns.length ? data.loadTestRuns.map((run) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsx("td", { className: "px-5 py-2.5 text-[12px] font-bold text-[#191F28]", children: run.runId }), _jsx("td", { className: "px-5 py-2.5", children: _jsx("span", { className: "rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-[#4E5968]", children: run.mode }) }), _jsxs("td", { className: "px-5 py-2.5 text-right text-[12px] font-bold text-[#191F28]", children: [formatNumber(run.completedJobs), "/", formatNumber(run.totalJobs)] }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-semibold text-[#00A661]", children: formatNumber(run.successJobs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-semibold text-[#E5484D]", children: formatNumber(run.failedJobs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] text-[#4E5968]", children: formatDuration(run.avgDurationMs) }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] font-bold text-[#F97316]", children: formatDuration(run.p95DurationMs) }), _jsxs("td", { className: "px-5 py-2.5 text-right text-[12px] text-[#4E5968]", children: [formatDecimal(run.throughputPerMinute), "/m"] }), _jsx("td", { className: "px-5 py-2.5 text-right text-[12px] text-[#4E5968]", children: formatDuration(run.elapsedMs) }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#8B95A1]", children: formatDateTime(run.createdAt) })] }, run.id))) : (_jsx("tr", { children: _jsx("td", { colSpan: 10, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '아직 저장된 부하테스트 리포트가 없습니다.' }) })) })] }) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC \uC791\uC5C5" }), _jsx(Link, { to: "/jobs", className: "text-[12px] text-[#3182F6] font-semibold hover:underline", children: "\uC804\uCCB4 \uBCF4\uAE30" })] }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uAE30\uAC04" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0DD\uC131 \uC2DC\uAC01" })] }) }), _jsx("tbody", { children: data?.recentJobs.length ? data.recentJobs.map((job) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50 transition-colors", children: [_jsx("td", { className: "px-5 py-2.5 text-[13px] font-bold text-[#191F28]", children: job.channelCd }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#4E5968]", children: formatPeriod(job.frDt, job.toDt) }), _jsx("td", { className: "px-5 py-2.5", children: _jsx(StatusBadge, { status: job.status }) }), _jsx("td", { className: "px-5 py-2.5 text-[12px] text-[#8B95A1]", children: formatDateTime(job.createdAt) })] }, job.requestId))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '아직 생성된 작업이 없습니다.' }) })) })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCC44\uB110\uBCC4 \uC218\uC9D1 \uD604\uD669" }) }), _jsx("div", { className: "divide-y divide-slate-50", children: data?.channelStats.length ? data.channelStats.map((ch) => {
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
function formatDecimal(value) {
    return value.toFixed(1);
}
function formatDuration(value) {
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}s`;
    }
    return `${Math.round(value)}ms`;
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
function shortWorkerId(value) {
    if (!value || value === 'unknown') {
        return 'unknown';
    }
    const parts = value.split(':');
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value;
}
function MetricBox({ label, value }) {
    return (_jsxs("div", { className: "rounded-lg bg-[#F8FAFC] px-4 py-3", children: [_jsx("p", { className: "text-[11px] font-bold uppercase tracking-wide text-[#8B95A1]", children: label }), _jsx("p", { className: "mt-1 text-[20px] font-extrabold text-[#191F28]", children: value })] }));
}
function LatencyLineChart({ points }) {
    if (!points.length) {
        return (_jsx("div", { className: "flex h-full items-center justify-center rounded-lg bg-[#FAFAFA] text-[13px] text-[#8B95A1]", children: "\uCC98\uB9AC\uC2DC\uAC04 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }));
    }
    const width = 860;
    const height = 260;
    const paddingLeft = 54;
    const paddingRight = 54;
    const paddingTop = 28;
    const paddingBottom = 38;
    const innerWidth = width - paddingLeft - paddingRight;
    const innerHeight = height - paddingTop - paddingBottom;
    const maxLatency = Math.max(...points.map((point) => point.p95DurationMs), 1);
    const maxCompleted = Math.max(...points.map((point) => point.completedJobs), 1);
    const step = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
    const barWidth = Math.max(10, Math.min(34, innerWidth / points.length * 0.52));
    const path = points.map((point, index) => {
        const x = paddingLeft + index * step;
        const y = paddingTop + innerHeight - (point.p95DurationMs / maxLatency) * innerHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const avgLatency = points.reduce((sum, point) => sum + point.avgDurationMs, 0) / points.length;
    const avgY = paddingTop + innerHeight - (avgLatency / maxLatency) * innerHeight;
    const gridTicks = [0, 0.25, 0.5, 0.75, 1];
    const labelEvery = Math.max(1, Math.ceil(points.length / 8));
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "h-full w-full overflow-visible", children: [_jsxs("defs", { children: [_jsxs("linearGradient", { id: "completedBars", x1: "0", x2: "0", y1: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#3182F6", stopOpacity: "0.95" }), _jsx("stop", { offset: "100%", stopColor: "#93C5FD", stopOpacity: "0.55" })] }), _jsxs("linearGradient", { id: "latencyArea", x1: "0", x2: "0", y1: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#F97316", stopOpacity: "0.20" }), _jsx("stop", { offset: "100%", stopColor: "#F97316", stopOpacity: "0.02" })] })] }), gridTicks.map((tick) => {
                const y = paddingTop + innerHeight - tick * innerHeight;
                return (_jsxs("g", { children: [_jsx("line", { x1: paddingLeft, y1: y, x2: width - paddingRight, y2: y, stroke: "#EDF2F7", strokeWidth: "1" }), _jsx("text", { x: paddingLeft - 10, y: y + 4, textAnchor: "end", fill: "#8B95A1", fontSize: "10", children: formatDuration(maxLatency * tick) })] }, tick));
            }), points.map((point, index) => {
                const x = paddingLeft + index * step;
                const barHeight = (point.completedJobs / maxCompleted) * innerHeight;
                return (_jsx("rect", { x: x - barWidth / 2, y: paddingTop + innerHeight - barHeight, width: barWidth, height: barHeight, rx: "4", fill: "url(#completedBars)" }, `bar-${point.bucket}`));
            }), _jsx("path", { d: `${path} L ${paddingLeft + (points.length - 1) * step} ${paddingTop + innerHeight} L ${paddingLeft} ${paddingTop + innerHeight} Z`, fill: "url(#latencyArea)" }), _jsx("line", { x1: paddingLeft, y1: avgY, x2: width - paddingRight, y2: avgY, stroke: "#F97316", strokeDasharray: "5 5", strokeWidth: "1.5" }), _jsx("path", { d: path, fill: "none", stroke: "#F97316", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" }), points.map((point, index) => {
                const x = paddingLeft + index * step;
                const y = paddingTop + innerHeight - (point.p95DurationMs / maxLatency) * innerHeight;
                return (_jsxs("g", { children: [_jsx("circle", { cx: x, cy: y, r: "4.5", fill: "#FFF7ED", stroke: "#F97316", strokeWidth: "2.5" }), index === points.length - 1 && (_jsxs("text", { x: Math.min(width - 112, x + 10), y: Math.max(14, y - 10), fill: "#9A3412", fontSize: "12", fontWeight: "800", children: ["P95 ", formatDuration(point.p95DurationMs)] })), index % labelEvery === 0 && (_jsx("text", { x: x, y: height - 12, textAnchor: "middle", fill: "#8B95A1", fontSize: "10", children: point.bucket }))] }, `${point.bucket}-${index}`));
            }), _jsx("line", { x1: paddingLeft, y1: paddingTop + innerHeight, x2: width - paddingRight, y2: paddingTop + innerHeight, stroke: "#DDE3EA", strokeWidth: "1" }), _jsx("text", { x: paddingLeft, y: 18, fill: "#4E5968", fontSize: "11", fontWeight: "800", children: "P95 \uCC98\uB9AC\uC2DC\uAC04" }), _jsx("text", { x: width - paddingRight, y: 18, textAnchor: "end", fill: "#4E5968", fontSize: "11", fontWeight: "800", children: "\uC644\uB8CC \uAC74\uC218" }), _jsx("circle", { cx: paddingLeft + 78, cy: 14, r: "4", fill: "#F97316" }), _jsx("rect", { x: width - paddingRight - 72, y: "8", width: "10", height: "10", rx: "2", fill: "#3182F6" })] }));
}
