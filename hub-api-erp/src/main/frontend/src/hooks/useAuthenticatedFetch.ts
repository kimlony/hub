import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

let authExpiredAlertShown = false

export function useAuthenticatedFetch() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  return useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(input, {
      ...init,
      headers,
    })

    if (response.status === 401 || response.status === 403) {
      logout()
      if (!authExpiredAlertShown) {
        authExpiredAlertShown = true
        alert('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      }
      navigate('/login', { replace: true })
      throw new Error('인증실패: 로그인 세션이 만료되었습니다.')
    }

    return response
  }, [token, logout, navigate])
}
