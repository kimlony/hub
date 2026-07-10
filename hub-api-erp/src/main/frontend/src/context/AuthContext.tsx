import { createContext, useContext, useState, ReactNode } from 'react'

export type UserRole = 'USER' | 'SYSTEM_ADMIN'

interface AuthCtx {
  token:    string | null
  username: string | null
  role:     UserRole
  isSystemAdmin: boolean
  login:    (token: string, username: string, role?: UserRole) => void
  logout:   () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

function normalizeRole(role: string | null | undefined): UserRole {
  return role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'USER'
}

function roleFromToken(token: string | null): UserRole | null {
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(paddedPayload)) as { role?: string }
    return normalizeRole(decoded.role)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const storedToken = localStorage.getItem('hub_token')
  const [token,    setToken]    = useState<string | null>(storedToken)
  const [username, setUsername] = useState<string | null>(localStorage.getItem('hub_username'))
  const [role,     setRole]     = useState<UserRole>(roleFromToken(storedToken) ?? normalizeRole(localStorage.getItem('hub_role')))

  function login(token: string, username: string, role?: UserRole) {
    const normalizedRole = roleFromToken(token) ?? normalizeRole(role)
    localStorage.setItem('hub_token',    token)
    localStorage.setItem('hub_username', username)
    localStorage.setItem('hub_role',     normalizedRole)
    setToken(token)
    setUsername(username)
    setRole(normalizedRole)
  }

  function logout() {
    localStorage.removeItem('hub_token')
    localStorage.removeItem('hub_username')
    localStorage.removeItem('hub_role')
    setToken(null)
    setUsername(null)
    setRole('USER')
  }

  return (
    <AuthContext.Provider value={{ token, username, role, isSystemAdmin: role === 'SYSTEM_ADMIN', login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}