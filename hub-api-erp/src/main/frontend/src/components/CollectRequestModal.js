import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
export default function CollectRequestModal({ onClose }) {
    const { token } = useAuth();
    const today = new Date().toISOString().slice(0, 10);
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [channels, setChannels] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const allRef = useRef(null);
    const activeMalls = channels.filter(c => c.registered && c.useYn === 'Y');
    const allChecked = activeMalls.length > 0 && selected.size === activeMalls.length;
    const someChecked = selected.size > 0 && !allChecked;
    useEffect(() => {
        fetch('/api/channels', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then((data) => setChannels(data))
            .finally(() => setLoading(false));
    }, [token]);
    useEffect(() => {
        if (allRef.current)
            allRef.current.indeterminate = someChecked;
    }, [someChecked]);
    function toggleAll() {
        setSelected(allChecked ? new Set() : new Set(activeMalls.map(c => c.mallKey)));
    }
    function toggleMall(key) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }
    function formatDate(dateStr) {
        return dateStr.replace(/-/g, '');
    }
    async function handleSubmit() {
        if (selected.size === 0 || submitting)
            return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/hub/jobs/batch', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    frDt: formatDate(startDate),
                    toDt: formatDate(endDate),
                    mallKeys: [...selected],
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message ?? '수집 요청 실패');
            }
            onClose();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '수집 요청 중 오류가 발생했습니다.');
        }
        finally {
            setSubmitting(false);
        }
    }
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-black/30", onClick: onClose }), _jsxs("div", { className: "relative w-[420px] bg-white rounded-2xl shadow-xl overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-slate-100", children: [_jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uC218\uC9D1 \uC694\uCCAD" }), _jsx("button", { onClick: onClose, className: "text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none", children: "\u00D7" })] }), _jsxs("div", { className: "px-6 py-5 space-y-5", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2", children: "\uC218\uC9D1 \uAE30\uAC04" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "date", value: startDate, onChange: e => setStartDate(e.target.value), className: "flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" }), _jsx("span", { className: "text-[#8B95A1] text-[13px]", children: "~" }), _jsx("input", { type: "date", value: endDate, onChange: e => setEndDate(e.target.value), className: "flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-xl bg-white text-[#4E5968] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[12px] font-semibold text-[#8B95A1] uppercase tracking-wide mb-2", children: "\uC1FC\uD551\uBAB0 \uC120\uD0DD" }), loading ? (_jsx("div", { className: "py-8 text-center text-[13px] text-[#8B95A1]", children: "\uBD88\uB7EC\uC624\uB294 \uC911..." })) : activeMalls.length === 0 ? (_jsxs("div", { className: "py-8 text-center text-[13px] text-[#8B95A1]", children: ["\uB4F1\uB85D\uB41C \uCC44\uB110\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", _jsx("br", {}), _jsx("span", { className: "text-[11px]", children: "\uCC44\uB110 \uAD00\uB9AC\uC5D0\uC11C \uCC44\uB110\uC744 \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694." })] })) : (_jsxs("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [_jsxs("label", { className: "flex items-center gap-3 px-4 py-3 bg-[#FAFAFA] border-b border-slate-100 cursor-pointer hover:bg-slate-50", children: [_jsx("input", { ref: allRef, type: "checkbox", checked: allChecked, onChange: toggleAll, className: "w-4 h-4 accent-[#3182F6]" }), _jsx("span", { className: "text-[13px] font-bold text-[#191F28]", children: "\uC804\uCCB4 \uC120\uD0DD" }), _jsxs("span", { className: "ml-auto text-[12px] text-[#8B95A1]", children: [selected.size, " / ", activeMalls.length] })] }), activeMalls.map(ch => (_jsxs("label", { className: "flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50", children: [_jsx("input", { type: "checkbox", checked: selected.has(ch.mallKey), onChange: () => toggleMall(ch.mallKey), className: "w-4 h-4 accent-[#3182F6]" }), _jsx("span", { className: "text-[13px] text-[#4E5968]", children: ch.mallName }), _jsx("span", { className: "ml-auto text-[11px] font-bold text-[#8B95A1]", children: ch.mallKey })] }, ch.mallKey)))] }))] }), error && (_jsx("p", { className: "text-[12px] text-red-500", children: error }))] }), _jsxs("div", { className: "flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100", children: [_jsx("button", { onClick: onClose, className: "px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200", children: "\uCDE8\uC18C" }), _jsx("button", { onClick: handleSubmit, disabled: selected.size === 0 || submitting, className: "px-4 py-2 text-[13px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed", children: submitting ? '요청 중...' : '수집 요청' })] })] })] }), document.body);
}
