import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
const EMPTY_FORM = { key: '', key2: '', authKey: '', mallId: '', mallPw: '', vendorId: '' };
export default function ChannelManagementModal({ onClose }) {
    const { token } = useAuth();
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const authHeader = { Authorization: `Bearer ${token}` };
    useEffect(() => {
        fetch('/api/channels', { headers: authHeader })
            .then(r => r.json())
            .then(setChannels)
            .finally(() => setLoading(false));
    }, [token]);
    function openForm(mallKey) {
        setExpanded(mallKey);
        setForm(EMPTY_FORM);
    }
    function closeForm() {
        setExpanded(null);
        setForm(EMPTY_FORM);
    }
    async function reload() {
        const data = await fetch('/api/channels', { headers: authHeader }).then(r => r.json());
        setChannels(data);
    }
    async function handleSave(ch) {
        setSaving(true);
        const method = ch.registered ? 'PUT' : 'POST';
        await fetch(`/api/channels/${ch.mallKey}`, {
            method,
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        await reload();
        closeForm();
        setSaving(false);
    }
    async function handleDelete(mallKey) {
        if (!confirm(`${mallKey} 채널을 삭제하시겠습니까?`))
            return;
        await fetch(`/api/channels/${mallKey}`, { method: 'DELETE', headers: authHeader });
        await reload();
    }
    async function handleToggle(mallKey) {
        await fetch(`/api/channels/${mallKey}/active`, { method: 'PATCH', headers: authHeader });
        await reload();
    }
    return createPortal(_jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [_jsx("div", { className: "absolute inset-0 bg-black/30", onClick: onClose }), _jsxs("div", { className: "relative w-[500px] max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0", children: [_jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uCC44\uB110 \uAD00\uB9AC" }), _jsx("button", { onClick: onClose, className: "text-[#8B95A1] hover:text-[#4E5968] text-[20px] leading-none", children: "\u00D7" })] }), _jsx("div", { className: "flex-1 overflow-y-auto px-6 py-4 space-y-3", children: loading ? (_jsx("div", { className: "py-10 text-center text-[13px] text-[#8B95A1]", children: "\uBD88\uB7EC\uC624\uB294 \uC911..." })) : channels.map(ch => (_jsxs("div", { className: "border border-slate-200 rounded-xl overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 bg-[#FAFAFA]", children: [_jsxs("div", { className: "flex-1", children: [_jsx("span", { className: "text-[13px] font-bold text-[#191F28]", children: ch.mallName }), _jsx("span", { className: "ml-2 text-[11px] font-bold text-[#8B95A1]", children: ch.mallKey })] }), ch.registered ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => handleToggle(ch.mallKey), className: `px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${ch.useYn === 'Y'
                                                        ? 'bg-[#E8FAF0] text-[#00C073]'
                                                        : 'bg-[#F2F4F6] text-[#8B95A1]'}`, children: ch.useYn === 'Y' ? '활성' : '비활성' }), _jsx("button", { onClick: () => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey), className: "px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200", children: "\uC218\uC815" }), _jsx("button", { onClick: () => handleDelete(ch.mallKey), className: "px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-50 text-[#FF6B6B] hover:bg-red-100", children: "\uC0AD\uC81C" })] })) : (_jsx("button", { onClick: () => expanded === ch.mallKey ? closeForm() : openForm(ch.mallKey), className: "px-3 py-1 text-[11px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600", children: "\uB4F1\uB85D" }))] }), expanded === ch.mallKey && (_jsxs("div", { className: "px-4 py-4 border-t border-slate-100 space-y-3", children: [([
                                            { label: 'mall_id', field: 'mallId', type: 'text' },
                                            { label: 'mall_pw', field: 'mallPw', type: 'password' },
                                            { label: 'vendor_id', field: 'vendorId', type: 'text' },
                                            { label: 'key1', field: 'key', type: 'text' },
                                            { label: 'key2', field: 'key2', type: 'text' },
                                        ]).map(({ label, field, type }) => (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "w-20 text-[12px] font-semibold text-[#8B95A1] flex-shrink-0", children: label }), _jsx("input", { type: type, value: form[field], placeholder: ch.registered ? '변경 시에만 입력 (빈칸 = 기존값 유지)' : '', onChange: e => setForm(prev => ({ ...prev, [field]: e.target.value })), className: "flex-1 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" })] }, field))), _jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [_jsx("button", { onClick: closeForm, className: "px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200", children: "\uCDE8\uC18C" }), _jsx("button", { onClick: () => handleSave(ch), disabled: saving, className: "px-3 py-1.5 text-[12px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600 disabled:opacity-40", children: saving ? '저장 중...' : '저장' })] })] }))] }, ch.mallKey))) }), _jsx("div", { className: "px-6 py-4 border-t border-slate-100 flex-shrink-0", children: _jsx("button", { onClick: onClose, className: "w-full px-4 py-2 text-[13px] font-semibold rounded-xl bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200", children: "\uB2EB\uAE30" }) })] })] }), document.body);
}
