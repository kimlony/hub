import { jsx as _jsx } from "react/jsx-runtime";
const styles = {
    RECEIVED: 'bg-purple-50 text-purple-600',
    QUEUED: 'bg-amber-50 text-amber-600',
    PROCESSING: 'bg-blue-50 text-[#3182F6]',
    SUCCESS: 'bg-[#E8FAF0] text-[#00C073]',
    FAILED: 'bg-red-50 text-[#FF6B6B]',
};
export default function StatusBadge({ status }) {
    const cls = styles[status] ?? 'bg-slate-100 text-slate-500';
    return (_jsx("span", { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cls}`, children: status }));
}
