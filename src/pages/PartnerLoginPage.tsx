import { useState, FormEvent } from 'react'

const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL ?? 'https://sliquid-b2b-production.up.railway.app'
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL ?? 'https://portal.sliquid.com'
const INSIDER_URL = 'https://sliquid.com/retailers/become-a-sliquid-retailer/'

export async function loginToPortal(email: string, password: string) {
  const res = await fetch(`${PORTAL_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? 'Invalid email or password.')
  }
  return res.json() as Promise<{ token: string; user: { name: string } }>
}

export default function PartnerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await loginToPortal(email.trim(), password)
      // Open portal in a new tab; token is passed via URL hash so the portal
      // can store it in its own localStorage (cross-origin localStorage doesn't work).
      window.open(`${PORTAL_URL}/dashboard#token=${encodeURIComponent(token)}`, '_blank')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
      <div className="w-full max-w-md">

        {/* Card */}
        <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10">

          {/* Icon + heading */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold">Partner Portal Login</h1>
            <p className="text-text-gray text-sm mt-1 text-center">Sign in to access your Sliquid partner resources.</p>
          </div>

          {/* Form */}
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

            <div>
              <label htmlFor="password" className="block text-text-dark text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
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
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer — no account */}
        <div className="mt-6 text-center">
          <p className="text-text-gray text-sm">
            Don't have an account?{' '}
            <a
              href={INSIDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sliquid-blue hover:text-sliquid-dark-blue font-medium transition-colors"
            >
              Register with Sliquid
            </a>
          </p>
        </div>

      </div>
    </div>
  )
}
