import { createContext, useContext, useState, ReactNode } from 'react'

interface AuthCtx {
  token:    string | null
  username: string | null
  login:    (token: string, username: string) => void
  logout:   () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null>(localStorage.getItem('hub_token'))
  const [username, setUsername] = useState<string | null>(localStorage.getItem('hub_username'))

  function login(token: string, username: string) {
    localStorage.setItem('hub_token',    token)
    localStorage.setItem('hub_username', username)
    setToken(token)
    setUsername(username)
  }

  function logout() {
    localStorage.removeItem('hub_token')
    localStorage.removeItem('hub_username')
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
