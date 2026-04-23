import { useState, FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'

const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL ?? 'https://sliquid-b2b-production.up.railway.app'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // No token in URL — show a clear error
  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold mb-3">Invalid reset link</h1>
            <p className="text-text-gray text-sm leading-relaxed mb-6">
              This password reset link is missing or invalid. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold
                         py-2.5 px-6 rounded-lg text-sm transition-colors duration-150"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${PORTAL_API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { message?: string }).message ?? 'Reset failed. Please try again.')
        return
      }
      // Success — redirect to login with a flag so it can show a success banner
      navigate('/partner-login', { state: { passwordReset: true } })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
      <div className="w-full max-w-md">

        <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10">

          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold">Set a new password</h1>
            <p className="text-text-gray text-sm mt-1 text-center">
              Choose a strong password for your partner account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="password" className="block text-text-dark text-sm font-medium mb-1.5">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                           placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                           focus:ring-1 focus:ring-sliquid-blue transition-colors"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-text-dark text-sm font-medium mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                           placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                           focus:ring-1 focus:ring-sliquid-blue transition-colors"
              />
            </div>

            {error && (
              <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60
                         disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg
                         text-sm transition-colors duration-150 mt-2"
            >
              {loading ? 'Saving…' : 'Reset Password'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/forgot-password"
            className="text-text-gray hover:text-sliquid-blue text-sm transition-colors"
          >
            Request a new reset link
          </Link>
        </div>

      </div>
    </div>
  )
}
