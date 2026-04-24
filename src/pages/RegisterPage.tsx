import { useState, FormEvent, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, CheckCircle, Eye, EyeOff } from 'lucide-react'

const PORTAL_API = import.meta.env.VITE_PORTAL_API_URL ?? 'https://sliquid-b2b-production.up.railway.app'

interface Store { id: number; name: string }

export default function RegisterPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [storeSearch, setStoreSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const storeRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [stores, setStores] = useState<Store[]>([])

  useEffect(() => {
    fetch(`${PORTAL_API}/api/stores`)
      .then(r => r.json())
      .then(setStores)
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (storeRef.current && !storeRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredStores = stores.filter(s =>
    s.name.toLowerCase().includes(storeSearch.toLowerCase())
  )

  function selectStore(storeName: string) {
    setCompany(storeName)
    setStoreSearch(storeName)
    setShowDropdown(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!company.trim()) { setError('Please enter or select your store or company'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch(`${PORTAL_API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), company: company.trim(), password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message ?? 'Registration failed')
      }
      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-text-dark text-2xl font-bold mb-2">Account submitted!</h2>
            <p className="text-text-gray text-sm mb-2">
              Your account is pending review. You'll receive full access once a Sliquid admin approves your registration.
            </p>
            <p className="text-text-gray text-sm mb-8">
              A confirmation email has been sent to <span className="text-text-dark font-medium">{email}</span>.
            </p>
            <button
              onClick={() => navigate('/partner-login')}
              className="w-full bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white py-16 px-6">
      <div className="w-full max-w-md">

        {/* Card */}
        <div className="bg-white rounded-card shadow-[0_20px_40px_rgba(0,0,0,0.08)] p-10">

          {/* Heading */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h1 className="text-text-dark text-2xl font-bold">Create an account</h1>
            <p className="text-text-gray text-sm mt-1 text-center">
              Access digital assets, distributors, and product trainings for your account type.
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Full Name */}
            <div>
              <label htmlFor="reg-name" className="block text-text-dark text-sm font-medium mb-1.5">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                           placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                           focus:ring-1 focus:ring-sliquid-blue transition-colors"
              />
            </div>

            {/* Store / Company */}
            <div>
              <label className="block text-text-dark text-sm font-medium mb-1.5">
                Store / Company
              </label>
              {stores.length > 0 ? (
                <div ref={storeRef} className="relative">
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={e => {
                      setStoreSearch(e.target.value)
                      setCompany(e.target.value)
                      setShowDropdown(true)
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Enter or search for your store…"
                    autoComplete="off"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-9 text-text-dark text-sm
                               placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                               focus:ring-1 focus:ring-sliquid-blue transition-colors"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  {showDropdown && filteredStores.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredStores.map(s => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onMouseDown={() => selectStore(s.name)}
                            className="w-full text-left px-4 py-2.5 text-text-dark text-sm hover:bg-bg-off-white transition-colors"
                          >
                            {s.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Enter or search for your store…"
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                             placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                             focus:ring-1 focus:ring-sliquid-blue transition-colors"
                />
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-text-dark text-sm font-medium mb-1.5">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                           placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                           focus:ring-1 focus:ring-sliquid-blue transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-text-dark text-sm font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-text-dark text-sm
                             placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                             focus:ring-1 focus:ring-sliquid-blue transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="reg-confirm" className="block text-text-dark text-sm font-medium mb-1.5">
                Confirm Password
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-text-dark text-sm
                           placeholder:text-text-light-gray focus:outline-none focus:border-sliquid-blue
                           focus:ring-1 focus:ring-sliquid-blue transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60
                         disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg
                         text-sm transition-colors duration-150 mt-2"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-text-gray text-sm mt-6">
            Already have an account?{' '}
            <Link to="/partner-login" className="text-sliquid-blue hover:text-sliquid-dark-blue font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
