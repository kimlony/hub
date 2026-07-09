import { Navigate } from 'react-router-dom'
import { useAuth, UserRole } from '../context/AuthContext'
import { ReactNode } from 'react'

export default function ProtectedRoute({ children, requiredRole }: { children: ReactNode; requiredRole?: UserRole }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (requiredRole && role !== requiredRole) return <Navigate to="/" replace />
  return <>{children}</>
}