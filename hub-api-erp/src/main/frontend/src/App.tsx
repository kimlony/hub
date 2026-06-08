import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage      from './pages/JobsPage'
import MonitorPage   from './pages/MonitorPage'
import SchedulePage  from './pages/SchedulePage'
import NewsPage      from './pages/NewsPage'
import ExternalApiPage from './pages/ExternalApiPage'

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
            <ProtectedRoute><MonitorPage /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
