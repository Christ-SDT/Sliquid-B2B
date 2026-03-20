import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api, setToken, clearToken } from '@/api/client'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, company: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Accept token passed via URL hash from the B2B site login page.
    // Hash is never sent to the server, and we clear it immediately after reading.
    const hash = window.location.hash
    if (hash.startsWith('#token=')) {
      const hashToken = decodeURIComponent(hash.slice(7))
      setToken(hashToken)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    const token = localStorage.getItem('portal_token')
    if (!token) { setLoading(false); return }
    api.get<User>('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password })
    setToken(res.token)
    setUser(res.user)
  }

  async function register(name: string, email: string, company: string, password: string) {
    await api.post<{ token: string; user: User }>('/auth/register', { name, email, company, password })
    // Do not auto-login — registration is pending admin approval
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
