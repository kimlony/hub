import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
const logs = [
    {
        time: '2026-06-08 16:42:11',
        clientId: 'client_erp_demo_01',
        method: 'GET',
        endpoint: '/api/external/orders',
        status: 200,
        latencyMs: 142,
        ip: '203.0.113.10',
        result: 'SUCCESS',
    },
    {
        time: '2026-06-08 16:41:54',
        clientId: 'client_wms_sync_01',
        method: 'POST',
        endpoint: '/api/external/auth/token',
        status: 200,
        latencyMs: 37,
        ip: '203.0.113.21',
        result: 'TOKEN_ISSUED',
    },
    {
        time: '2026-06-08 16:40:03',
        clientId: 'client_partner_test_01',
        method: 'GET',
        endpoint: '/api/external/orders',
        status: 403,
        latencyMs: 18,
        ip: '203.0.113.32',
        result: 'CLIENT_DISABLED',
    },
    {
        time: '2026-06-08 16:37:22',
        clientId: 'client_erp_demo_01',
        method: 'POST',
        endpoint: '/api/external/auth/token',
        status: 401,
        latencyMs: 21,
        ip: '203.0.113.10',
        result: 'INVALID_SIGNATURE',
    },
];
const tabs = [
    { value: 'clients', label: '클라이언트 관리' },
    { value: 'guide', label: 'API 가이드' },
    { value: 'logs', label: '호출 로그' },
];
const signatureExample = [
    'timestamp = "2026-06-08T16:42:00+09:00"',
    'message = `${clientId}.${timestamp}`',
    'signature = HMAC_SHA256(clientSecret, message)',
].join('\n');
const tokenRequestExample = [
    'POST /api/external/auth/token',
    'X-BizBee-Client-Id: client_1_abcd1234',
    'X-BizBee-Timestamp: 2026-06-08T16:42:00+09:00',
    'X-BizBee-Signature: 47b1...a92f',
].join('\n');
const tokenResponseExample = [
    '{',
    '  "accessToken": "eyJhbGciOiJIUzI1NiIs...",',
    '  "tokenType": "Bearer",',
    '  "expiresIn": 1800,',
    '  "scope": "orders:read"',
    '}',
].join('\n');
const orderRequestExample = [
    'GET /api/external/orders?channelCd=NAVER&frDt=20260608&toDt=20260608&page=1&size=50',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...',
].join('\n');
export default function ExternalApiPage() {
    const authenticatedFetch = useAuthenticatedFetch();
    const [activeTab, setActiveTab] = useState('clients');
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [clientName, setClientName] = useState('');
    const [issuedSecret, setIssuedSecret] = useState(null);
    const fetchClients = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authenticatedFetch('/api/hub/external/clients');
            if (!response.ok) {
                throw new Error(`클라이언트 목록 조회 실패 (${response.status})`);
            }
            const data = await response.json();
            setClients(data);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '클라이언트 목록을 불러오지 못했습니다.');
        }
        finally {
            setLoading(false);
        }
    }, [authenticatedFetch]);
    useEffect(() => {
        void fetchClients();
    }, [fetchClients]);
    async function handleCreateClient(event) {
        event.preventDefault();
        const trimmedName = clientName.trim();
        if (!trimmedName) {
            setError('클라이언트명을 입력해주세요.');
            return;
        }
        setCreating(true);
        setError(null);
        try {
            const response = await authenticatedFetch('/api/hub/external/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName: trimmedName,
                    scopes: ['orders:read'],
                    allowedIps: [],
                    tokenTtlSeconds: 1800,
                    signatureValidSeconds: 300,
                }),
            });
            if (!response.ok) {
                throw new Error(`클라이언트 발급 실패 (${response.status})`);
            }
            const data = await response.json();
            setIssuedSecret(data);
            setClients((prev) => [data.client, ...prev]);
            setClientName('');
            setActiveTab('clients');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '클라이언트 발급에 실패했습니다.');
        }
        finally {
            setCreating(false);
        }
    }
    const stats = useMemo(() => {
        const activeCount = clients.filter((client) => client.status === 'ACTIVE').length;
        const pausedCount = clients.filter((client) => client.status !== 'ACTIVE').length;
        return [
            { label: '활성 클라이언트', value: `${activeCount}개`, caption: '현재 호출 가능' },
            { label: '중지 클라이언트', value: `${pausedCount}개`, caption: '보류/비활성' },
            { label: '토큰 만료 시간', value: '30분', caption: '기본 정책' },
            { label: '서명 허용 오차', value: '5분', caption: '재전송 방지' },
        ];
    }, [clients]);
    return (_jsxs(Layout, { title: "\uC678\uBD80 API \uC5F0\uB3D9", actions: _jsx("button", { onClick: () => setActiveTab('clients'), className: "px-3 py-2 text-[12px] font-bold rounded-lg bg-[#3182F6] text-white hover:bg-blue-600 transition-colors", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uBC1C\uAE09" }), children: [issuedSecret && (_jsx(IssuedSecretPanel, { issued: issuedSecret, onClose: () => setIssuedSecret(null) })), _jsxs("div", { className: "space-y-5", children: [_jsxs("section", { className: "bg-white border border-slate-100 rounded-lg", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uC678\uBD80 \uC5F0\uB3D9 \uC778\uC99D \uC124\uACC4" }), _jsx("p", { className: "mt-1 text-[12px] text-[#6B7684]", children: "\uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uD074\uB77C\uC774\uC5B8\uD2B8\uB97C \uBC1C\uAE09\uD558\uACE0, \uC678\uBD80 \uC2DC\uC2A4\uD15C\uC740 HMAC \uC11C\uBA85\uC73C\uB85C \uC9E7\uC740 \uB9CC\uB8CC JWT\uB97C \uBC1C\uAE09\uBC1B\uC544 \uC8FC\uBB38 Export API\uB97C \uD638\uCD9C\uD569\uB2C8\uB2E4." })] }), _jsx("div", { className: "flex rounded-lg bg-[#F2F4F6] p-1", children: tabs.map((tab) => (_jsx("button", { onClick: () => setActiveTab(tab.value), className: 'px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors ' +
                                                (activeTab === tab.value
                                                    ? 'bg-white text-[#3182F6] shadow-sm'
                                                    : 'text-[#6B7684] hover:text-[#191F28]'), children: tab.label }, tab.value))) })] }), _jsx("div", { className: "grid grid-cols-4 gap-px bg-slate-100", children: stats.map((stat) => (_jsxs("div", { className: "bg-white px-5 py-4", children: [_jsx("p", { className: "text-[11px] font-semibold text-[#8B95A1]", children: stat.label }), _jsx("p", { className: "mt-2 text-[22px] font-extrabold text-[#191F28]", children: stat.value }), _jsx("p", { className: "mt-1 text-[11px] text-[#8B95A1]", children: stat.caption })] }, stat.label))) })] }), error && (_jsx("div", { className: "rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-600", children: error })), activeTab === 'clients' && (_jsx(ClientsTab, { clients: clients, loading: loading, creating: creating, clientName: clientName, onClientNameChange: setClientName, onCreateClient: handleCreateClient, onRefresh: () => void fetchClients() })), activeTab === 'guide' && _jsx(GuideTab, {}), activeTab === 'logs' && _jsx(LogsTab, {})] })] }));
}
function IssuedSecretPanel({ issued, onClose }) {
    const [copied, setCopied] = useState(null);
    async function copy(value, type) {
        await navigator.clipboard.writeText(value);
        setCopied(type);
        setTimeout(() => setCopied(null), 1500);
    }
    return (_jsx("div", { className: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4", children: _jsxs("div", { className: "w-full max-w-2xl rounded-lg bg-white shadow-xl", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100", children: [_jsx("h3", { className: "text-[16px] font-extrabold text-[#191F28]", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uBC1C\uAE09 \uC644\uB8CC" }), _jsx("p", { className: "mt-1 text-[12px] text-[#6B7684]", children: "Secret\uC740 \uC774 \uD654\uBA74\uC5D0\uC11C\uB9CC \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uB2EB\uAE30 \uC804\uC5D0 \uC678\uBD80 \uC2DC\uC2A4\uD15C \uC124\uC815\uC5D0 \uC800\uC7A5\uD574\uC8FC\uC138\uC694." })] }), _jsxs("div", { className: "p-5 space-y-4", children: [_jsx(SecretField, { label: "Client ID", value: issued.client.clientId, copied: copied === 'clientId', onCopy: () => void copy(issued.client.clientId, 'clientId') }), _jsx(SecretField, { label: "Client Secret", value: issued.clientSecret, copied: copied === 'clientSecret', onCopy: () => void copy(issued.clientSecret, 'clientSecret') }), _jsx("div", { className: "rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-700", children: issued.warning })] }), _jsx("div", { className: "px-5 py-4 border-t border-slate-100 flex justify-end", children: _jsx("button", { onClick: onClose, className: "px-4 py-2 rounded-lg bg-[#191F28] text-white text-[12px] font-bold hover:bg-slate-700", children: "\uD655\uC778\uD588\uC2B5\uB2C8\uB2E4" }) })] }) }));
}
function SecretField({ label, value, copied, onCopy }) {
    return (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-[11px] font-bold text-[#8B95A1]", children: label }), _jsxs("div", { className: "flex items-stretch rounded-lg border border-slate-200 overflow-hidden", children: [_jsx("code", { className: "flex-1 bg-[#F9FAFB] px-3 py-3 text-[12px] text-[#191F28] overflow-x-auto", children: value }), _jsx("button", { onClick: onCopy, className: "w-24 bg-white border-l border-slate-200 text-[12px] font-bold text-[#3182F6] hover:bg-[#EBF3FE]", children: copied ? '복사됨' : '복사' })] })] }));
}
function ClientsTab({ clients, loading, creating, clientName, onClientNameChange, onCreateClient, onRefresh, }) {
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("section", { className: "bg-white border border-slate-100 rounded-lg", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uC0C8 \uD074\uB77C\uC774\uC5B8\uD2B8 \uBC1C\uAE09" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uBC1C\uAE09\uB41C Secret\uC740 \uCD5C\uCD08 \uC751\uB2F5\uC5D0\uC11C\uB9CC \uD45C\uC2DC\uB429\uB2C8\uB2E4." })] }), _jsxs("form", { onSubmit: onCreateClient, className: "p-5 grid grid-cols-[1fr_160px_120px] gap-3 items-end", children: [_jsxs("label", { children: [_jsx("span", { className: "mb-2 block text-[11px] font-bold text-[#8B95A1]", children: "\uD074\uB77C\uC774\uC5B8\uD2B8\uBA85" }), _jsx("input", { value: clientName, onChange: (event) => onClientNameChange(event.target.value), placeholder: "\uC608: ERP Demo", className: "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#3182F6]" })] }), _jsxs("label", { children: [_jsx("span", { className: "mb-2 block text-[11px] font-bold text-[#8B95A1]", children: "\uAE30\uBCF8 \uAD8C\uD55C" }), _jsx("input", { value: "orders:read", disabled: true, className: "w-full rounded-lg border border-slate-200 bg-[#F9FAFB] px-3 py-2.5 text-[13px] text-[#6B7684]" })] }), _jsx("button", { type: "submit", disabled: creating, className: "h-[42px] rounded-lg bg-[#3182F6] px-4 text-[12px] font-bold text-white hover:bg-blue-600 disabled:bg-slate-300", children: creating ? '발급 중' : '발급' })] })] }), _jsxs("section", { className: "bg-white border border-slate-100 rounded-lg overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uB0B4 \uD074\uB77C\uC774\uC5B8\uD2B8 \uBAA9\uB85D" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "Secret\uC740 \uBAA9\uB85D\uC5D0 \uD45C\uC2DC\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uBD84\uC2E4 \uC2DC \uC7AC\uBC1C\uAE09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." })] }), _jsx("button", { onClick: onRefresh, className: "px-3 py-2 text-[12px] font-bold rounded-lg bg-[#F2F4F6] text-[#4E5968] hover:bg-slate-200", children: "\uC0C8\uB85C\uACE0\uCE68" })] }), _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-[#F9FAFB] text-[11px] font-bold text-[#8B95A1]", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-3", children: "\uD074\uB77C\uC774\uC5B8\uD2B8" }), _jsx("th", { className: "px-5 py-3", children: "CLIENT ID" }), _jsx("th", { className: "px-5 py-3", children: "\uAD8C\uD55C" }), _jsx("th", { className: "px-5 py-3", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3", children: "\uD1A0\uD070 TTL" }), _jsx("th", { className: "px-5 py-3", children: "\uB9C8\uC9C0\uB9C9 \uD638\uCD9C" }), _jsx("th", { className: "px-5 py-3", children: "\uC0DD\uC131 \uC2DC\uAC01" })] }) }), _jsxs("tbody", { className: "divide-y divide-slate-100", children: [loading && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-10 text-center text-[12px] text-[#8B95A1]", children: "\uD074\uB77C\uC774\uC5B8\uD2B8 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4." }) })), !loading && clients.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-5 py-10 text-center text-[12px] text-[#8B95A1]", children: "\uC544\uC9C1 \uBC1C\uAE09\uB41C \uD074\uB77C\uC774\uC5B8\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }) })), !loading && clients.map((client) => (_jsxs("tr", { className: "text-[12px] text-[#4E5968]", children: [_jsxs("td", { className: "px-5 py-4", children: [_jsx("p", { className: "font-extrabold text-[#191F28]", children: client.clientName }), _jsxs("p", { className: "mt-0.5 text-[11px] text-[#8B95A1]", children: ["Secret \uD68C\uC804 ", client.secretRotatedAt ?? '-'] })] }), _jsx("td", { className: "px-5 py-4 font-mono text-[11px]", children: client.clientId }), _jsx("td", { className: "px-5 py-4", children: _jsx("div", { className: "flex flex-wrap gap-1", children: client.scopes.map((scope) => (_jsx("span", { className: "rounded-md bg-[#EBF3FE] px-2 py-1 text-[11px] font-bold text-[#3182F6]", children: scope }, scope))) }) }), _jsx("td", { className: "px-5 py-4", children: _jsx(StatusBadge, { status: client.status }) }), _jsxs("td", { className: "px-5 py-4", children: [Math.floor(client.tokenTtlSeconds / 60), "\uBD84"] }), _jsx("td", { className: "px-5 py-4", children: client.lastCalledAt ?? '-' }), _jsx("td", { className: "px-5 py-4", children: client.createdAt ?? '-' })] }, client.clientId)))] })] })] })] }));
}
function GuideTab() {
    return (_jsxs("div", { className: "grid grid-cols-[360px_1fr] gap-5", children: [_jsxs("section", { className: "bg-white border border-slate-100 rounded-lg p-5", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uC778\uC99D \uD750\uB984" }), _jsx("div", { className: "mt-4 space-y-3", children: [
                            '화면에서 클라이언트를 발급하고 Client Secret을 외부 시스템에 저장합니다.',
                            '외부 시스템은 clientId와 timestamp로 HMAC 서명을 만듭니다.',
                            '서명 검증이 성공하면 30분짜리 JWT를 발급합니다.',
                            '주문 Export API는 Bearer Token과 scope를 확인합니다.',
                            '모든 호출은 감사 로그와 실패 사유로 남깁니다.',
                        ].map((step, index) => (_jsxs("div", { className: "flex gap-3", children: [_jsx("span", { className: "w-6 h-6 rounded-md bg-[#3182F6] text-white text-[11px] font-extrabold flex items-center justify-center", children: index + 1 }), _jsx("p", { className: "pt-0.5 text-[12px] leading-5 text-[#4E5968]", children: step })] }, step))) })] }), _jsxs("section", { className: "bg-white border border-slate-100 rounded-lg overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uC5F0\uB3D9 \uAC00\uC774\uB4DC" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uC678\uBD80 \uC2DC\uC2A4\uD15C\uC740 \uBA3C\uC800 \uD1A0\uD070\uC744 \uBC1C\uAE09\uBC1B\uC740 \uB4A4 \uC8FC\uBB38 Export API\uB97C \uD638\uCD9C\uD569\uB2C8\uB2E4." })] }), _jsxs("div", { className: "p-5 grid grid-cols-2 gap-4", children: [_jsx(CodeBlock, { title: "\uC11C\uBA85 \uC0DD\uC131", code: signatureExample }), _jsx(CodeBlock, { title: "\uD1A0\uD070 \uBC1C\uAE09 \uC694\uCCAD", code: tokenRequestExample }), _jsx(CodeBlock, { title: "\uD1A0\uD070 \uBC1C\uAE09 \uC751\uB2F5", code: tokenResponseExample }), _jsx(CodeBlock, { title: "\uC8FC\uBB38 Export \uD638\uCD9C", code: orderRequestExample })] }), _jsxs("div", { className: "px-5 pb-5", children: [_jsx("h4", { className: "text-[12px] font-extrabold text-[#191F28] mb-2", children: "\uB300\uD45C \uC624\uB958 \uCF54\uB4DC" }), _jsx("div", { className: "grid grid-cols-5 gap-2", children: ['INVALID_SIGNATURE', 'TIMESTAMP_EXPIRED', 'CLIENT_DISABLED', 'TOKEN_EXPIRED', 'RATE_LIMITED'].map((code) => (_jsx("div", { className: "rounded-lg border border-slate-100 bg-[#F9FAFB] px-3 py-2 font-mono text-[11px] text-[#4E5968]", children: code }, code))) })] })] })] }));
}
function LogsTab() {
    return (_jsxs("section", { className: "bg-white border border-slate-100 rounded-lg overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100", children: [_jsx("h3", { className: "text-[14px] font-extrabold text-[#191F28]", children: "\uCD5C\uADFC \uD638\uCD9C \uB85C\uADF8" }), _jsx("p", { className: "mt-1 text-[12px] text-[#8B95A1]", children: "\uC11C\uBA85 \uC2E4\uD328, \uD1A0\uD070 \uB9CC\uB8CC, \uC81C\uD55C \uCD08\uACFC \uAC19\uC740 \uC6B4\uC601 \uC774\uC288\uB97C \uCD94\uC801\uD569\uB2C8\uB2E4." })] }), _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-[#F9FAFB] text-[11px] font-bold text-[#8B95A1]", children: _jsxs("tr", { children: [_jsx("th", { className: "px-5 py-3", children: "\uC2DC\uAC04" }), _jsx("th", { className: "px-5 py-3", children: "CLIENT ID" }), _jsx("th", { className: "px-5 py-3", children: "\uC694\uCCAD" }), _jsx("th", { className: "px-5 py-3", children: "\uC0C1\uD0DC" }), _jsx("th", { className: "px-5 py-3", children: "\uC9C0\uC5F0" }), _jsx("th", { className: "px-5 py-3", children: "IP" }), _jsx("th", { className: "px-5 py-3", children: "\uACB0\uACFC" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: logs.map((log) => (_jsxs("tr", { className: "text-[12px] text-[#4E5968]", children: [_jsx("td", { className: "px-5 py-4", children: log.time }), _jsx("td", { className: "px-5 py-4 font-mono text-[11px]", children: log.clientId }), _jsxs("td", { className: "px-5 py-4", children: [_jsx("span", { className: "font-extrabold text-[#191F28]", children: log.method }), _jsx("span", { className: "ml-2 font-mono text-[11px]", children: log.endpoint })] }), _jsx("td", { className: "px-5 py-4", children: _jsx("span", { className: `rounded-md px-2 py-1 text-[11px] font-extrabold ${log.status < 300 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`, children: log.status }) }), _jsxs("td", { className: "px-5 py-4", children: [log.latencyMs, "ms"] }), _jsx("td", { className: "px-5 py-4", children: log.ip }), _jsx("td", { className: "px-5 py-4 font-mono text-[11px]", children: log.result })] }, `${log.time}-${log.result}`))) })] })] }));
}
function StatusBadge({ status }) {
    const active = status === 'ACTIVE';
    return (_jsx("span", { className: `rounded-md px-2 py-1 text-[11px] font-extrabold ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`, children: status }));
}
function CodeBlock({ title, code }) {
    return (_jsxs("div", { className: "rounded-lg border border-slate-100 overflow-hidden", children: [_jsx("div", { className: "px-3 py-2 bg-[#F9FAFB] border-b border-slate-100 text-[12px] font-extrabold text-[#191F28]", children: title }), _jsx("pre", { className: "p-3 text-[11px] leading-5 text-[#4E5968] overflow-x-auto bg-white", children: _jsx("code", { children: code }) })] }));
}
