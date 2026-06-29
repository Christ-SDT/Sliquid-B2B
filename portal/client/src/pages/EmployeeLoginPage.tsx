import { useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2, ShieldCheck } from 'lucide-react'

// Human-readable copy for the error codes the SSO callback may bounce back with.
const SSO_ERRORS: Record<string, string> = {
  sso_unavailable: 'Sliquid SSO is not available right now. Please try again later.',
  missing_code: 'The sign-in response was incomplete. Please try again.',
  missing_state: 'Your sign-in session expired. Please try again.',
  invalid_state: 'Your sign-in session expired. Please try again.',
  state_mismatch: 'Your sign-in session could not be verified. Please try again.',
  token_exchange_failed: 'We could not complete sign-in with Sliquid SSO. Please try again.',
  no_id_token: 'We could not complete sign-in with Sliquid SSO. Please try again.',
  no_email: 'Your Sliquid account is missing an email address. Contact IT.',
  verification_failed: 'We could not verify your Sliquid identity. Please try again.',
  access_denied: 'Sign-in was cancelled.',
}

export default function EmployeeLoginPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const errorCode = params.get('sso_error')
  const error = errorCode ? (SSO_ERRORS[errorCode] ?? 'Sign-in failed. Please try again.') : ''

  function startSso() {
    setLoading(true)
    // Full-page navigation to the server, which begins the OIDC redirect dance.
    window.location.href = `${import.meta.env.VITE_API_URL ?? ''}/auth/google/login`
  }

  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/images/cropped-lotus.png"
            alt="Sliquid lotus"
            className="w-12 h-12 object-contain mb-4"
          />
          <h1 className="text-on-canvas font-bold text-2xl tracking-wider">SLIQUID</h1>
          <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">EMPLOYEE PORTAL</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          <h2 className="text-on-canvas text-xl font-semibold mb-1">Employee sign-in</h2>
          <p className="text-on-canvas-muted text-sm mb-6">
            Use your Sliquid company account to access the portal.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={startSso}
            disabled={loading}
            className="w-full bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60 text-white font-semibold
                       py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {loading ? 'Redirecting…' : 'Sign in with Sliquid SSO'}
          </button>

          <p className="text-on-canvas-muted text-xs text-center mt-6">
            Not an employee?{' '}
            <Link to="/login" className="text-portal-accent hover:underline">
              Partner sign-in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
