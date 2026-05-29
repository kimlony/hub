import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import MonitorPage from './pages/MonitorPage';
import SchedulePage from './pages/SchedulePage';
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/", element: _jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/jobs", element: _jsx(ProtectedRoute, { children: _jsx(JobsPage, {}) }) }), _jsx(Route, { path: "/schedules", element: _jsx(ProtectedRoute, { children: _jsx(SchedulePage, {}) }) }), _jsx(Route, { path: "/monitor", element: _jsx(ProtectedRoute, { children: _jsx(MonitorPage, {}) }) })] }) }) }));
}
