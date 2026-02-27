import { useState, FormEvent } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-portal-accent flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3C16 3 5 14.5 5 20.5a11 11 0 0022 0C27 14.5 16 3 16 3z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-white font-bold text-2xl tracking-wider">SLIQUID</h1>
          <p className="text-slate-500 text-xs font-medium tracking-widest mt-1">PARTNER PORTAL</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          <h2 className="text-white text-xl font-semibold mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-6">Sign in to access your partner dashboard.</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-white text-sm
                           placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-white text-sm
                           placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60 text-white font-semibold
                         py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-slate-500 text-xs">
              Don't have an account?{' '}
              <Link to="/register" className="text-portal-accent hover:underline">
                Create one
              </Link>
            </p>
            <p className="text-slate-600 text-xs">
              <Link to="/forgot-password" className="text-slate-500 hover:text-slate-400">
                Forgot your password?
              </Link>
            </p>
          </div>
        </div>

        {/* Demo hint */}
        <div className="mt-4 p-4 rounded-xl border border-portal-border bg-surface/50 text-xs text-slate-600">
          <p className="font-semibold text-slate-500 mb-1">Demo accounts</p>
          <p>admin@sliquid.com / admin123</p>
          <p>partner@demo.com / partner123</p>
        </div>
      </div>
    </div>
  )
}
