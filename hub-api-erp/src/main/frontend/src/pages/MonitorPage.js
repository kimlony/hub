import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
export default function MonitorPage() {
    const [data, setData] = useState(null);
    const [workerData, setWorkerData] = useState(null);
    const [distributionData, setDistributionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const authenticatedFetch = useAuthenticatedFetch();
    const fetchMonitor = useCallback(async () => {
        setError('');
        try {
            const res = await authenticatedFetch('/api/hub/kafka/monitor');
            if (!res.ok) {
                throw new Error(`Kafka monitor API failed: ${res.status}`);
            }
            setData(await res.json());
            const workerRes = await authenticatedFetch('/api/hub/workers/status');
            if (!workerRes.ok) {
                throw new Error(`Worker status API failed: ${workerRes.status}`);
            }
            setWorkerData(await workerRes.json());
            const distributionRes = await authenticatedFetch('/api/hub/kafka/job-distribution?minutes=60');
            if (!distributionRes.ok) {
                throw new Error(`Kafka job distribution API failed: ${distributionRes.status}`);
            }
            setDistributionData(await distributionRes.json());
        }
        catch (err) {
            if (err.message !== 'Authentication required') {
                setError('모니터링 데이터를 불러오지 못했습니다.');
            }
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch]);
    useEffect(() => {
        void fetchMonitor();
    }, [fetchMonitor]);
    useEffect(() => {
        const id = setInterval(() => { void fetchMonitor(); }, 10000);
        return () => clearInterval(id);
    }, [fetchMonitor]);
    const stats = useMemo(() => [
        {
            label: '토픽',
            value: formatNumber(data?.stats.topicCount ?? 0),
            gradient: 'from-[#3182F6] to-[#5BABF9]',
        },
        {
            label: '브로커',
            value: formatNumber(data?.stats.brokerCount ?? 0),
            gradient: 'from-[#00C073] to-[#3DDC97]',
        },
        {
            label: 'Consumer Lag',
            value: formatNumber(data?.stats.totalLag ?? 0),
            gradient: 'from-amber-400 to-yellow-300',
        },
        {
            label: 'Worker Online',
            value: `${formatNumber(workerData?.stats.onlineCount ?? 0)} / ${formatNumber(workerData?.stats.totalCount ?? 0)}`,
            gradient: 'from-[#64748B] to-[#94A3B8]',
        },
    ], [data, workerData]);
    const partitions = useMemo(() => data?.topics.flatMap((topic) => topic.partitionDetails) ?? [], [data]);
    const maxDistributionCount = Math.max(...(distributionData?.summary.map((item) => item.jobCount) ?? [0]), 1);
    return (_jsxs(Layout, { title: "Kafka \uD604\uD669", actions: _jsx("button", { onClick: () => { setLoading(true); void fetchMonitor(); }, className: "px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200 transition-colors", children: "\uC0C8\uB85C\uACE0\uCE68" }), children: [(error || data?.status === 'ERROR') && (_jsx("div", { className: "mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600", children: error || data?.errorMessage || 'Kafka 상태를 확인하지 못했습니다.' })), _jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { className: "text-[12px] text-[#8B95A1]", children: ["Consumer Group: ", _jsx("span", { className: "font-mono font-semibold text-[#4E5968]", children: data?.consumerGroup ?? '-' })] }), _jsxs("div", { className: "flex items-center gap-2 text-[12px] text-[#8B95A1]", children: [_jsx(StatusPill, { status: data?.status ?? (loading ? 'LOADING' : 'UNKNOWN') }), _jsx("span", { children: data?.generatedAt ? formatDateTime(data.generatedAt) : '-' })] })] }), _jsx("div", { className: "grid grid-cols-4 gap-4 mb-5", children: stats.map((s) => (_jsxs("div", { className: `bg-gradient-to-br ${s.gradient} rounded-lg p-5 text-white`, children: [_jsx("p", { className: "text-[12px] font-semibold opacity-85 mb-2", children: s.label }), _jsx("p", { className: "text-[28px] font-extrabold leading-none", children: loading && !data ? '-' : s.value })] }, s.label))) }), _jsxs("div", { className: "grid grid-cols-2 gap-4 mb-4", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uD1A0\uD53D" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uD1A0\uD53D\uBA85" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uD30C\uD2F0\uC158" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uBCF5\uC81C" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Lag" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" })] }) }), _jsx("tbody", { children: data?.topics.length ? data.topics.map((topic) => (_jsxs("tr", { className: "border-t border-slate-50", children: [_jsx("td", { className: "px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]", children: topic.name }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: topic.partitions }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: topic.replicas }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: formatNumber(topic.lag) }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusPill, { status: topic.status }) })] }, topic.name))) : (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '토픽 정보가 없습니다.' }) })) })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uBE0C\uB85C\uCEE4" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "ID" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Host" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Rack" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" })] }) }), _jsx("tbody", { children: data?.brokers.length ? data.brokers.map((broker) => (_jsxs("tr", { className: "border-t border-slate-50", children: [_jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: broker.id }), _jsxs("td", { className: "px-5 py-3 font-mono text-[13px] font-semibold text-[#191F28]", children: [broker.host, ":", broker.port] }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: broker.rack ?? '-' }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusPill, { status: broker.status }) })] }, broker.id))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '브로커 정보가 없습니다.' }) })) })] })] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uD30C\uD2F0\uC158 \uC0C1\uC138" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Topic" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Partition" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Leader" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Latest" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Committed" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Lag" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Consumer" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" })] }) }), _jsx("tbody", { children: partitions.length ? partitions.map((partition) => (_jsxs("tr", { className: "border-t border-slate-50", children: [_jsx("td", { className: "px-5 py-3 font-mono text-[12px] font-semibold text-[#191F28]", children: partition.topic }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: partition.partition }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: partition.leader }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: formatNumber(partition.latestOffset) }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: formatNumber(partition.committedOffset) }), _jsx("td", { className: "px-5 py-3 text-[13px] font-bold text-[#191F28]", children: formatNumber(partition.lag) }), _jsx("td", { className: "px-5 py-3 text-[12px] text-[#4E5968]", children: partition.consumerId ? (_jsxs("div", { className: "max-w-[280px]", children: [_jsx("p", { className: "truncate font-mono font-semibold", children: partition.clientId ?? partition.consumerId }), _jsx("p", { className: "truncate text-[#8B95A1]", children: partition.host ?? '-' })] })) : (_jsx("span", { className: "text-[#8B95A1]", children: "unassigned" })) }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusPill, { status: partition.status }) })] }, `${partition.topic}-${partition.partition}`))) : (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : '파티션 상세 정보가 없습니다.' }) })) })] })] }), _jsxs("div", { className: "mt-4 grid grid-cols-[420px_1fr] gap-4", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "Kafka Job \uBD84\uD3EC" }), _jsxs("span", { className: "text-[12px] text-[#8B95A1]", children: ["\uCD5C\uADFC ", distributionData?.minutes ?? 60, "\uBD84"] })] }), _jsx("div", { className: "divide-y divide-slate-50", children: distributionData?.summary.length ? distributionData.summary.map((item) => {
                                    const pct = Math.max(4, Math.round((item.jobCount / maxDistributionCount) * 100));
                                    return (_jsxs("div", { className: "px-5 py-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-[13px] font-extrabold text-[#191F28]", children: ["Partition ", item.partition] }), _jsx("p", { className: "mt-1 max-w-[280px] truncate text-[11px] text-[#8B95A1]", children: joinList(item.kafkaClientIds) || joinList(item.workerInstanceIds) || 'worker 없음' })] }), _jsx("span", { className: "text-[18px] font-extrabold text-[#191F28]", children: formatNumber(item.jobCount) })] }), _jsx("div", { className: "mt-3 h-2 rounded-full bg-[#F2F4F6]", children: _jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#5BABF9]", style: { width: `${pct}%` } }) }), _jsx("p", { className: "mt-2 text-[11px] text-[#8B95A1]", children: joinList(item.channels) || '-' })] }, item.partition));
                                }) : (_jsx("div", { className: "px-5 py-10 text-center text-[13px] text-[#8B95A1]", children: "\uCD5C\uADFC Kafka \uC218\uC2E0 \uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." })) })] }), _jsxs("div", { className: "bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-50", children: _jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC Kafka Job \uCD94\uC801" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Job" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Channel" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Partition" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Offset" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Worker" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Time" })] }) }), _jsx("tbody", { children: distributionData?.recentJobs.length ? distributionData.recentJobs.map((job) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50", children: [_jsxs("td", { className: "px-5 py-3", children: [_jsxs("p", { className: "font-mono text-[12px] font-semibold text-[#191F28]", children: [job.requestId.slice(0, 8), "..."] }), _jsx("p", { className: "mt-1 max-w-[220px] truncate text-[11px] text-[#8B95A1]", title: job.messageKey, children: job.messageKey })] }), _jsx("td", { className: "px-5 py-3 text-[13px] font-bold text-[#4E5968]", children: job.channelCd }), _jsx("td", { className: "px-5 py-3 text-[13px] font-bold text-[#191F28]", children: job.partition }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: job.offset }), _jsxs("td", { className: "px-5 py-3", children: [_jsx("p", { className: "max-w-[220px] truncate font-mono text-[12px] font-semibold text-[#4E5968]", title: job.kafkaClientId, children: job.kafkaClientId || job.workerInstanceId }), _jsx("p", { className: "mt-1 text-[11px] text-[#8B95A1]", children: job.workerInstanceId })] }), _jsx("td", { className: "px-5 py-3 text-[12px] text-[#8B95A1]", children: job.createdAt })] }, `${job.requestId}-${job.kafkaMessageId}`))) : (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-5 py-10 text-center text-[13px] text-[#8B95A1]", children: "\uCD5C\uADFC Kafka Job \uCD94\uC801 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) })] })] })] }), _jsxs("div", { className: "mt-4 bg-white rounded-lg shadow-sm overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-5 py-4 border-b border-slate-50", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "Worker \uC0C1\uD0DC" }), _jsxs("div", { className: "text-[12px] text-[#8B95A1]", children: ["Online ", formatNumber(workerData?.stats.onlineCount ?? 0), " \u00B7 Stale ", formatNumber(workerData?.stats.staleCount ?? 0), " \u00B7 Stopped ", formatNumber(workerData?.stats.stoppedCount ?? 0)] })] }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA]", children: [_jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Worker" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Role" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "PID" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Host" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Last Seen" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Interval" }), _jsx("th", { className: "px-5 py-2.5 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" })] }) }), _jsx("tbody", { children: workerData?.workers.length ? workerData.workers.map((worker) => (_jsxs("tr", { className: "border-t border-slate-50", children: [_jsx("td", { className: "px-5 py-3 font-mono text-[12px] font-semibold text-[#191F28]", children: worker.workerId }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: worker.role }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: worker.pid }), _jsx("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: worker.hostname }), _jsxs("td", { className: "px-5 py-3 text-[12px] text-[#4E5968]", children: [_jsx("div", { children: worker.lastSeenAt }), _jsxs("div", { className: "text-[#8B95A1]", children: [formatNumber(worker.secondsSinceSeen), "\uCD08 \uC804"] })] }), _jsxs("td", { className: "px-5 py-3 text-[13px] text-[#4E5968]", children: [worker.heartbeatIntervalSeconds, "s"] }), _jsx("td", { className: "px-5 py-3", children: _jsx(StatusPill, { status: worker.status }) })] }, worker.workerId))) : (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-8 text-center text-[13px] text-[#8B95A1]", children: loading ? '불러오는 중입니다.' : 'Worker heartbeat 데이터가 없습니다.' }) })) })] })] })] }));
}
function StatusPill({ status }) {
    const normalized = status.toUpperCase();
    const color = normalized === 'HEALTHY' || normalized === 'ONLINE'
        ? 'text-[#00C073] bg-[#E8FAF0]'
        : normalized === 'WARN'
            ? 'text-amber-600 bg-amber-50'
            : normalized === 'STALE'
                ? 'text-amber-700 bg-amber-50'
                : normalized === 'LOADING'
                    ? 'text-[#3182F6] bg-blue-50'
                    : 'text-red-600 bg-red-50';
    return (_jsxs("span", { className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${color}`, children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-current inline-block" }), status] }));
}
function formatNumber(value) {
    return new Intl.NumberFormat('ko-KR').format(value);
}
function formatDateTime(value) {
    if (!value) {
        return '-';
    }
    return value.replace('T', ' ').slice(0, 19);
}
function joinList(values) {
    return values.filter(Boolean).join(', ');
}
