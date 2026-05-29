import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage     from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsPage      from './pages/JobsPage'
import MonitorPage   from './pages/MonitorPage'
import SchedulePage  from './pages/SchedulePage'

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
          <Route path="/monitor" element={
            <ProtectedRoute><MonitorPage /></ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
