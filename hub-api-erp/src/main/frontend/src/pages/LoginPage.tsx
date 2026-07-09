import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, UserRole } from '../context/AuthContext'

export default function LoginPage() {
  const { login }    = useAuth()
  const navigate     = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.message ?? '로그인에 실패했습니다.')
      }
      const { token, username: name, role } = await res.json()
      login(token, name, role as UserRole)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="w-[360px] bg-white rounded-2xl shadow-sm p-8">
        <div className="mb-6 text-center">
          <div className="w-10 h-10 bg-[#3182F6] rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-extrabold text-[14px]">B</span>
          </div>
          <h1 className="text-[18px] font-extrabold text-[#191F28]">Easy HUB</h1>
          <p className="text-[13px] text-[#8B95A1] mt-1">주문수집 자동화 플랫폼</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 text-[14px] border border-slate-200 rounded-xl text-[#191F28] placeholder-[#C4C9D1] focus:outline-none focus:ring-2 focus:ring-[#3182F6]/30"
          />
          {error && (
            <p className="text-[12px] text-[#FF6B6B] text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-[14px] font-bold rounded-xl bg-[#3182F6] text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
