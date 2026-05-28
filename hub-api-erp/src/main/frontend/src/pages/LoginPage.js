import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.message ?? '로그인에 실패했습니다.');
            }
            const { token, username: name } = await res.json();
            login(token, name);
            navigate('/');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-[#F9FAFB] flex items-center justify-center", children: _jsxs("div", { className: "w-[360px] bg-white rounded-2xl shadow-sm p-8", children: [_jsxs("div", { className: "mb-6 text-center", children: [_jsx("div", { className: "w-10 h-10 bg-[#3182F6] rounded-xl flex items-center justify-center mx-auto mb-3", children: _jsx("span", { className: "text-white font-extrabold text-[14px]", children: "B" }) }), _jsx("h1", { className: "text-[18px] font-extrabold text-[#191F28]", children: "BizBee HUB" }), _jsx("p", { className: "text-[13px] text-[#8B95A1] mt-1", children: "\uC8FC\uBB38\uC218\uC9D1 \uC790\uB3D9\uD654 \uD50C\uB7AB\uD3FC" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [_jsx("input", { type: "text", placeholder: "\uC544\uC774\uB514", value: username, onChange: (e) => setUsername(e.target.value), required: true, className: "w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" }), _jsx("input", { type: "password", placeholder: "\uBE44\uBC00\uBC88\uD638", value: password, onChange: (e) => setPassword(e.target.value), required: true, className: "w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30" }), error && (_jsx("p", { className: "text-[12px] text-[#FF6B6B] text-center", children: error })), _jsx("button", { type: "submit", disabled: loading, className: "w-full py-3 text-[14px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors disabled:opacity-50", children: loading ? '로그인 중...' : '로그인' })] })] }) }));
}
