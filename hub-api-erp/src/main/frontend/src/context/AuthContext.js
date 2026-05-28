import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from 'react';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [token, setToken] = useState(localStorage.getItem('hub_token'));
    const [username, setUsername] = useState(localStorage.getItem('hub_username'));
    function login(token, username) {
        localStorage.setItem('hub_token', token);
        localStorage.setItem('hub_username', username);
        setToken(token);
        setUsername(username);
    }
    function logout() {
        localStorage.removeItem('hub_token');
        localStorage.removeItem('hub_username');
        setToken(null);
        setUsername(null);
    }
    return (_jsx(AuthContext.Provider, { value: { token, username, login, logout }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
