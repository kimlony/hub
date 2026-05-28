import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
const nav = [
    {
        section: '메인',
        items: [{ label: '대시보드', to: '/', icon: '🏠' }],
    },
    {
        section: '주문수집',
        items: [
            { label: '작업 목록', to: '/jobs', icon: '📋', badge: 3 },
        ],
    },
    {
        section: '모니터링',
        items: [
            { label: 'Kafka 현황', to: '/monitor', icon: '⚡' },
        ],
    },
];
export default function Sidebar() {
    return (_jsxs("aside", { className: "w-56 flex flex-col flex-shrink-0 bg-white border-r border-slate-100 h-screen", children: [_jsx("div", { className: "px-5 py-6", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-8 h-8 bg-[#3182F6] rounded-xl flex items-center justify-center text-white font-extrabold text-sm", children: "B" }), _jsxs("div", { children: [_jsx("p", { className: "text-[#191F28] font-extrabold text-[15px] leading-tight", children: "BizBee HUB" }), _jsx("p", { className: "text-[#8B95A1] text-[11px]", children: "\uC8FC\uBB38\uC218\uC9D1 \uD50C\uB7AB\uD3FC" })] })] }) }), _jsx("nav", { className: "flex-1 px-3 overflow-y-auto", children: nav.map(({ section, items }) => (_jsxs("div", { className: "mb-5", children: [_jsx("p", { className: "px-2 mb-1.5 text-[10px] font-semibold text-[#B0B8C1] uppercase tracking-wider", children: section }), items.map(({ label, to, icon, badge }) => (_jsxs(NavLink, { to: to, end: to === '/', className: ({ isActive }) => `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] mb-0.5 transition-all ` +
                                (isActive
                                    ? 'bg-[#EBF3FE] text-[#3182F6] font-bold'
                                    : 'text-[#8B95A1] hover:bg-slate-50 hover:text-[#191F28] font-medium'), children: [_jsx("span", { className: "text-base w-5 text-center", children: icon }), _jsx("span", { className: "flex-1", children: label }), badge !== undefined && (_jsx("span", { className: "bg-[#FF6B6B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none", children: badge }))] }, to)))] }, section))) }), _jsx("div", { className: "px-5 py-4 border-t border-slate-100", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-gradient-to-br from-[#3182F6] to-indigo-400 flex items-center justify-center text-white text-sm font-bold", children: "K" }), _jsxs("div", { children: [_jsx("p", { className: "text-[#191F28] text-[13px] font-bold", children: "\uAD00\uB9AC\uC790" }), _jsx("p", { className: "text-[#8B95A1] text-[11px]", children: "bizbee.co.kr" })] })] }) })] }));
}
