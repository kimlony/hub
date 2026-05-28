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
        alert('Login has expired. Please sign in again.')
      }
      navigate('/login', { replace: true })
      throw new Error('Authentication required')
    }

    return response
  }, [token, logout, navigate])
}
