import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'

const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL ?? 'https://sliquid-b2b-production.up.railway.app'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setError('')
    setLoading(true)
    try {
      await fetch(`${PORTAL_API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      // Always show success — server never reveals whether the email exists
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10 text-center">
            <div className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold mb-3">Check your email</h1>
            <p className="text-text-gray text-sm leading-relaxed mb-6">
              If an account exists for <span className="font-medium text-text-dark">{email}</span>, you will receive a password reset link within a few minutes. Check your spam folder if you don't see it.
            </p>
            <Link
              to="/partner-login"
              className="text-sliquid-blue hover:text-sliquid-dark-blue text-sm font-medium transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
      <div className="w-full max-w-md">

        <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10">

          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold">Forgot your password?</h1>
            <p className="text-text-gray text-sm mt-1 text-center">
              Enter your account email and we'll send you a reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-text-dark text-sm font-medium mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourstore.com"
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
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/partner-login"
            className="text-text-gray hover:text-sliquid-blue text-sm transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>

      </div>
    </div>
  )
}
