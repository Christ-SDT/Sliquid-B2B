import { useState, FormEvent } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState('tier1')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await register(name, email, company, password, role)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.message === 'Email already in use' ? 'Email already in use' : (err.message ?? 'Registration failed'))
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
          <h1 className="text-on-canvas font-bold text-2xl tracking-wider">SLIQUID</h1>
          <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">PARTNER PORTAL</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          <h2 className="text-on-canvas text-xl font-semibold mb-1">Create an account</h2>
          <p className="text-on-canvas-muted text-sm mb-6">Access digital assets, distributors, and product trainings for your account type.</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Acme Corp"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Account Type</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           focus:outline-none focus:border-portal-accent transition-colors"
              >
                <option value="tier1">Tier 1 – Retail Store Employee</option>
                <option value="tier2">Tier 2 – Ecommerce</option>
                <option value="tier3">Tier 3 – Distributor</option>
              </select>
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 pr-10 text-on-canvas text-sm
                             placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-canvas-muted hover:text-on-canvas-subtle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60 text-white font-semibold
                         py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-on-canvas-muted text-xs mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-portal-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
