import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
const DATE_RANGE_LABELS = {
    YESTERDAY: '어제',
    TODAY: '오늘',
    LAST_3_DAYS: '최근 3일',
    LAST_7_DAYS: '최근 7일',
};
const DEFAULT_FORM = {
    scheduleName: '매일 주문수집',
    mallKeys: [],
    dateRangeType: 'YESTERDAY',
    runTime: '02:00',
    enabledYn: 'Y',
};
function formatText(value) {
    return value && value.trim() ? value : '-';
}
export default function SchedulePage() {
    const authenticatedFetch = useAuthenticatedFetch();
    const [channels, setChannels] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [runLogs, setRunLogs] = useState([]);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const activeChannels = useMemo(() => channels.filter((channel) => channel.registered && channel.useYn === 'Y'), [channels]);
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [channelRes, scheduleRes] = await Promise.all([
                authenticatedFetch('/api/channels'),
                authenticatedFetch('/api/hub/schedules'),
            ]);
            if (!channelRes.ok)
                throw new Error('채널 조회에 실패했습니다.');
            if (!scheduleRes.ok)
                throw new Error('배치 작업 조회에 실패했습니다.');
            setChannels(await channelRes.json());
            const body = await scheduleRes.json();
            setSchedules(body.schedules);
            setRunLogs(body.runLogs ?? []);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '데이터 조회 중 오류가 발생했습니다.');
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch]);
    useEffect(() => {
        void fetchData();
    }, [fetchData]);
    function toggleMall(mallKey) {
        setForm((prev) => {
            const selected = new Set(prev.mallKeys);
            selected.has(mallKey) ? selected.delete(mallKey) : selected.add(mallKey);
            return { ...prev, mallKeys: [...selected] };
        });
    }
    function startEdit(schedule) {
        setEditingId(schedule.id);
        setForm({
            scheduleName: schedule.scheduleName,
            mallKeys: schedule.mallKeys,
            dateRangeType: schedule.dateRangeType,
            runTime: schedule.runTime,
            enabledYn: schedule.enabledYn,
        });
    }
    function resetForm() {
        setEditingId(null);
        setForm(DEFAULT_FORM);
    }
    async function handleSubmit() {
        if (form.mallKeys.length === 0 || submitting)
            return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await authenticatedFetch(editingId ? `/api/hub/schedules/${editingId}` : '/api/hub/schedules', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message ?? '배치 작업 저장에 실패했습니다.');
            }
            resetForm();
            await fetchData();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '배치 작업 저장 중 오류가 발생했습니다.');
        }
        finally {
            setSubmitting(false);
        }
    }
    async function toggleEnabled(schedule) {
        const enabledYn = schedule.enabledYn === 'Y' ? 'N' : 'Y';
        await authenticatedFetch(`/api/hub/schedules/${schedule.id}/enabled`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledYn }),
        });
        await fetchData();
    }
    async function deleteSchedule(id) {
        if (!window.confirm('배치 작업을 삭제할까요?'))
            return;
        await authenticatedFetch(`/api/hub/schedules/${id}`, { method: 'DELETE' });
        if (editingId === id)
            resetForm();
        await fetchData();
    }
    return (_jsxs(Layout, { title: "\uBC30\uCE58 \uC791\uC5C5", children: [_jsxs("div", { className: "grid grid-cols-[360px_1fr] gap-6", children: [_jsxs("section", { className: "bg-white rounded-2xl shadow-sm border border-slate-100 p-5 h-fit", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: editingId ? '배치 수정' : '새 배치 등록' }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uB9E4\uC77C \uC9C0\uC815\uD55C \uC2DC\uAC04\uC5D0 \uC218\uC9D1 job\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4." })] }), editingId && (_jsx("button", { onClick: resetForm, className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200", children: "\uC2E0\uADDC" }))] }), _jsxs("div", { className: "mt-5 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-2 text-[12px] font-bold text-[#8B95A1]", children: "\uC791\uC5C5\uBA85" }), _jsx("input", { value: form.scheduleName, onChange: (e) => setForm((prev) => ({ ...prev, scheduleName: e.target.value })), className: "w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-2 text-[12px] font-bold text-[#8B95A1]", children: "\uC2E4\uD589 \uC2DC\uAC04" }), _jsx("input", { type: "time", value: form.runTime, onChange: (e) => setForm((prev) => ({ ...prev, runTime: e.target.value })), className: "w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-2 text-[12px] font-bold text-[#8B95A1]", children: "\uC218\uC9D1 \uBC94\uC704" }), _jsx("select", { value: form.dateRangeType, onChange: (e) => setForm((prev) => ({ ...prev, dateRangeType: e.target.value })), className: "w-full px-3 py-2 text-[13px] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30", children: Object.entries(DATE_RANGE_LABELS).map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-2 text-[12px] font-bold text-[#8B95A1]", children: "\uCC44\uB110" }), _jsx("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: activeChannels.length === 0 ? (_jsx("div", { className: "px-4 py-8 text-center text-[13px] text-[#8B95A1]", children: "\uD65C\uC131\uD654\uB41C \uCC44\uB110\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." })) : (activeChannels.map((channel) => (_jsxs("label", { className: "flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: form.mallKeys.includes(channel.mallKey), onChange: () => toggleMall(channel.mallKey), className: "w-4 h-4 accent-[#3182F6]" }), _jsx("span", { className: "text-[13px] font-semibold text-[#4E5968]", children: channel.mallName }), _jsx("span", { className: "ml-auto text-[11px] font-bold text-[#8B95A1]", children: channel.mallKey })] }, channel.mallKey)))) })] }), _jsxs("label", { className: "flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#F8FAFC] cursor-pointer", children: [_jsx("span", { className: "text-[13px] font-bold text-[#4E5968]", children: "\uC0AC\uC6A9 \uC5EC\uBD80" }), _jsx("input", { type: "checkbox", checked: form.enabledYn === 'Y', onChange: (e) => setForm((prev) => ({ ...prev, enabledYn: e.target.checked ? 'Y' : 'N' })), className: "w-4 h-4 accent-[#3182F6]" })] }), error && _jsx("p", { className: "text-[12px] text-red-500", children: error }), _jsx("button", { onClick: handleSubmit, disabled: submitting || form.mallKeys.length === 0, className: "w-full px-4 py-2.5 text-[13px] font-extrabold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed", children: submitting ? '저장 중...' : editingId ? '수정 저장' : '배치 등록' })] })] }), _jsxs("section", { className: "bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-100", children: _jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uB4F1\uB85D\uB41C \uBC30\uCE58" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA] border-b border-slate-100", children: [_jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC791\uC5C5\uBA85" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC2DC\uAC04" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uB2E4\uC74C \uC2E4\uD589" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC561\uC158" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-5 py-12 text-center text-[13px] text-[#8B95A1]", children: "\uBD88\uB7EC\uC624\uB294 \uC911..." }) })) : schedules.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-5 py-12 text-center text-[13px] text-[#8B95A1]", children: "\uB4F1\uB85D\uB41C \uBC30\uCE58 \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) : (schedules.map((schedule) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50", children: [_jsxs("td", { className: "px-5 py-3", children: [_jsx("p", { className: "text-[13px] font-bold text-[#191F28]", children: schedule.scheduleName }), _jsx("p", { className: "mt-1 text-[11px] text-[#8B95A1]", children: DATE_RANGE_LABELS[schedule.dateRangeType] ?? schedule.dateRangeType })] }), _jsx("td", { className: "px-5 py-3 text-[13px] font-bold text-[#4E5968]", children: schedule.runTime }), _jsx("td", { className: "px-5 py-3", children: _jsx("div", { className: "flex flex-wrap gap-1.5", children: schedule.mallKeys.map((mallKey) => (_jsx("span", { className: "px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]", children: mallKey }, mallKey))) }) }), _jsx("td", { className: "px-5 py-3 text-[12px] text-[#8B95A1]", children: formatText(schedule.nextRunAt) }), _jsx("td", { className: "px-5 py-3", children: _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("span", { className: `w-fit px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${schedule.enabledYn === 'Y' ? 'bg-[#E8FAF0] text-[#00A661]' : 'bg-slate-100 text-[#8B95A1]'}`, children: schedule.enabledYn === 'Y' ? 'ON' : 'OFF' }), schedule.runningYn === 'Y' && (_jsx("span", { className: "text-[11px] font-bold text-[#3182F6]", children: "\uC2E4\uD589 \uC911" })), schedule.lastErrorMessage && (_jsx("span", { className: "max-w-[180px] truncate text-[11px] text-red-500", title: schedule.lastErrorMessage, children: schedule.lastErrorMessage }))] }) }), _jsx("td", { className: "px-5 py-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => startEdit(schedule), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-slate-100 text-[#4E5968] hover:bg-slate-200", children: "\uC218\uC815" }), _jsx("button", { onClick: () => void toggleEnabled(schedule), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-blue-50 text-[#3182F6] hover:bg-blue-100", children: schedule.enabledYn === 'Y' ? '중지' : '시작' }), _jsx("button", { onClick: () => void deleteSchedule(schedule.id), className: "px-3 py-1.5 text-[12px] font-bold rounded-xl bg-red-50 text-red-600 hover:bg-red-100", children: "\uC0AD\uC81C" })] }) })] }, schedule.id)))) })] })] })] }), _jsxs("section", { className: "mt-6 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-slate-100", children: _jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC \uBC30\uCE58 \uC2E4\uD589 \uC774\uB825" }) }), _jsxs("table", { className: "w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#FAFAFA] border-b border-slate-100", children: [_jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC791\uC5C5\uBA85" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uCC44\uB110" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uAE30\uAC04" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "Job" }), _jsx("th", { className: "px-5 py-3 text-left text-[11px] font-semibold text-[#8B95A1] uppercase tracking-wide", children: "\uC2DC\uAC01" })] }) }), _jsx("tbody", { children: runLogs.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-5 py-10 text-center text-[13px] text-[#8B95A1]", children: "\uC544\uC9C1 \uC2E4\uD589 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }) })) : (runLogs.map((log) => (_jsxs("tr", { className: "border-t border-slate-50 hover:bg-slate-50", children: [_jsxs("td", { className: "px-5 py-3", children: [_jsx("p", { className: "text-[13px] font-bold text-[#191F28]", children: log.scheduleName }), log.errorMessage && (_jsx("p", { className: "mt-1 max-w-[260px] truncate text-[11px] text-red-500", title: log.errorMessage, children: log.errorMessage }))] }), _jsx("td", { className: "px-5 py-3", children: _jsx("span", { className: `px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${log.status === 'SUCCESS'
                                                    ? 'bg-[#E8FAF0] text-[#00A661]'
                                                    : log.status === 'FAILED'
                                                        ? 'bg-red-50 text-red-600'
                                                        : 'bg-blue-50 text-[#3182F6]'}`, children: log.status }) }), _jsx("td", { className: "px-5 py-3", children: _jsx("div", { className: "flex flex-wrap gap-1.5", children: log.mallKeys.map((mallKey) => (_jsx("span", { className: "px-2 py-0.5 rounded-lg bg-slate-100 text-[11px] font-bold text-[#4E5968]", children: mallKey }, mallKey))) }) }), _jsxs("td", { className: "px-5 py-3 text-[12px] text-[#4E5968]", children: [formatJobDate(log.frDt), " ~ ", formatJobDate(log.toDt)] }), _jsx("td", { className: "px-5 py-3 text-[13px] font-bold text-[#4E5968]", children: log.jobCount }), _jsx("td", { className: "px-5 py-3 text-[12px] text-[#8B95A1]", children: formatText(log.finishedAt ?? log.startedAt) })] }, log.id)))) })] })] })] }));
}
function formatJobDate(value) {
    if (/^\d{8}$/.test(value)) {
        return `${value.slice(4, 6)}/${value.slice(6, 8)}`;
    }
    return value || '-';
}
