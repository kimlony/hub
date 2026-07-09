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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('hub_token'))
  const [username, setUsername] = useState<string | null>(localStorage.getItem('hub_username'))
  const [role,     setRole]     = useState<UserRole>(normalizeRole(localStorage.getItem('hub_role')))

  function login(token: string, username: string, role: UserRole = 'USER') {
    const normalizedRole = normalizeRole(role)
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