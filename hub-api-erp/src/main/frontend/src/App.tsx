import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage      from './pages/JobsPage'
import MonitorPage   from './pages/MonitorPage'
import OutboxPage    from './pages/OutboxPage'
import SchedulePage  from './pages/SchedulePage'
import NewsPage      from './pages/NewsPage'
import ExternalApiPage from './pages/ExternalApiPage'
import LoadTestPage from './pages/LoadTestPage'
import CollectedOrdersPage from './pages/CollectedOrdersPage'
import ErpApplyResultsPage from './pages/ErpApplyResultsPage'
import OrderExportPage from './pages/OrderExportPage'
import DbMigrationsPage from './pages/DbMigrationsPage'
import JobExecutionMetricsPage from './pages/JobExecutionMetricsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/jobs" element={
            <ProtectedRoute><JobsPage /></ProtectedRoute>
          } />
          <Route path="/orders" element={
            <ProtectedRoute><CollectedOrdersPage /></ProtectedRoute>
          } />
          <Route path="/order-export" element={
            <ProtectedRoute><OrderExportPage /></ProtectedRoute>
          } />
          <Route path="/erp-apply-results" element={
            <ProtectedRoute><ErpApplyResultsPage /></ProtectedRoute>
          } />
          <Route path="/schedules" element={
            <ProtectedRoute><SchedulePage /></ProtectedRoute>
          } />
          <Route path="/news" element={
            <ProtectedRoute><NewsPage /></ProtectedRoute>
          } />
          <Route path="/external" element={
            <ProtectedRoute><ExternalApiPage /></ProtectedRoute>
          } />
          <Route path="/monitor" element={
            <ProtectedRoute requiredRole="SYSTEM_ADMIN"><MonitorPage /></ProtectedRoute>
          } />
          <Route path="/outbox" element={
            <ProtectedRoute requiredRole="SYSTEM_ADMIN"><OutboxPage /></ProtectedRoute>
          } />
          <Route path="/load-test" element={
            <ProtectedRoute requiredRole="SYSTEM_ADMIN"><LoadTestPage /></ProtectedRoute>
          } />
          <Route path="/db-migrations" element={
            <ProtectedRoute requiredRole="SYSTEM_ADMIN"><DbMigrationsPage /></ProtectedRoute>
          } />
          <Route path="/job-execution-metrics" element={
            <ProtectedRoute requiredRole="SYSTEM_ADMIN"><JobExecutionMetricsPage /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
