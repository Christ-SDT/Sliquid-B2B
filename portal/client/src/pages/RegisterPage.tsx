import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState, FormEvent, useEffect, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2, Eye, EyeOff, ChevronDown, CheckCircle } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { serverErrorText } from '@/lib/serverError'

interface Store { id: number; name: string }

export default function RegisterPage() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.register'))
  const { user, register } = useAuth()
  const { t } = useTranslation('auth')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [storeSearch, setStoreSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const storeRef = useRef<HTMLDivElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stores, setStores] = useState<Store[]>([])
  const [requestedRole, setRequestedRole] = useState<'tier1' | 'tier2' | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/stores`)
      .then(r => r.json())
      .then(setStores)
      .catch(() => {}) // silently fail — text input used as fallback
  }, [])

  // Close dropdown on outside click
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

  function selectStore(name: string) {
    setCompany(name)
    setStoreSearch(name)
    setShowDropdown(false)
  }

  if (user) return <Navigate to="/dashboard" replace />

  if (submitted) {
    return (
      <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <div className="flex flex-col items-center mb-8">
            <img src="/images/cropped-lotus.png" alt={t('brand.logoAlt')} className="w-12 h-12 object-contain mb-4" />
            <h1 className="text-on-canvas font-bold text-2xl tracking-wider">SLIQUID</h1>
            <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">{t('brand.partnerPortal')}</p>
          </div>
          <div className="bg-surface border border-portal-border rounded-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-on-canvas text-xl font-semibold mb-2">{t('register.success.title')}</h2>
            <p className="text-on-canvas-muted text-sm mb-2">
              {t('register.success.pending')}
            </p>
            <p className="text-on-canvas-muted text-sm mb-6">
              <Trans t={t} i18nKey="register.success.emailSent" values={{ email }}
                components={{ bold: <span className="text-on-canvas-subtle" /> }} />
            </p>
            <Link
              to="/login"
              className="inline-block w-full bg-portal-accent hover:bg-portal-accent/90 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {t('shared.backToSignIn')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!company) { setError(t('register.errors.storeRequired')); return }
    if (password.length < 8) { setError(t('register.errors.passwordShort')); return }
    if (password !== confirm) { setError(t('register.errors.passwordMismatch')); return }
    setLoading(true)
    try {
      await register(name, email, company, password, requestedRole ?? undefined)
      setSubmitted(true)
    } catch (err: any) {
      setError(serverErrorText(err, t('register.errors.failed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/images/cropped-lotus.png"
            alt={t('brand.logoAlt')}
            className="w-12 h-12 object-contain mb-4"
          />
          <h1 className="text-on-canvas font-bold text-2xl tracking-wider">SLIQUID</h1>
          <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">{t('brand.partnerPortal')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          <h2 className="text-on-canvas text-xl font-semibold mb-1">{t('register.title')}</h2>
          <p className="text-on-canvas-muted text-sm mb-6">{t('register.subtitle')}</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('register.fullName')}</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('register.namePlaceholder')}
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>

            <div>
              <label htmlFor="register-store" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('register.store')}</label>
              {stores.length > 0 ? (
                <div ref={storeRef} className="relative">
                  <div className="relative">
                    <input
                      id="register-store"
                      type="text"
                      value={storeSearch}
                      onChange={e => {
                        setStoreSearch(e.target.value)
                        setCompany('')
                        setShowDropdown(true)
                      }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder={t('register.storeSearchPlaceholder')}
                      autoComplete="off"
                      required={!company}
                      className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 pr-9 text-on-canvas text-sm
                                 placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
                    />
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none" />
                  </div>
                  {showDropdown && (
                    <ul className="absolute z-20 mt-1 w-full bg-surface border border-portal-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredStores.length > 0 ? filteredStores.map(s => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onMouseDown={() => selectStore(s.name)}
                            className="w-full text-left px-4 py-2.5 text-on-canvas text-sm hover:bg-surface-elevated transition-colors"
                          >
                            {s.name}
                          </button>
                        </li>
                      )) : (
                        <li className="px-4 py-2.5 text-on-canvas-muted text-sm">{t('register.noStoresMatch')}</li>
                      )}
                    </ul>
                  )}
                  {/* hidden native input to satisfy form required validation */}
                  <input type="hidden" value={company} required />
                </div>
              ) : (
                <input
                  id="register-store"
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder={t('register.storePlaceholder')}
                  required
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                             placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
                />
              )}
            </div>

            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                {t('register.role')} <span className="text-on-canvas-muted font-normal">{t('register.optional')}</span>
              </label>
              <p className="text-on-canvas-muted text-xs mb-2">{t('register.roleHint')}</p>
              <div className="flex gap-5">
                <label className="flex items-center gap-2 text-on-canvas-subtle text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestedRole === 'tier1'}
                    onChange={() => setRequestedRole(prev => prev === 'tier1' ? null : 'tier1')}
                    className="w-4 h-4 rounded border-portal-border bg-portal-bg text-portal-accent focus:ring-portal-accent"
                  />
                  {t('common:roles.tier1')}
                </label>
                <label className="flex items-center gap-2 text-on-canvas-subtle text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestedRole === 'tier2'}
                    onChange={() => setRequestedRole(prev => prev === 'tier2' ? null : 'tier2')}
                    className="w-4 h-4 rounded border-portal-border bg-portal-bg text-portal-accent focus:ring-portal-accent"
                  />
                  {t('common:roles.tier2')}
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="register-email" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('shared.email')}</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('shared.emailPlaceholder')}
                required
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>

            <div>
              <label htmlFor="register-password" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('shared.password')}</label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('register.passwordPlaceholder')}
                  required
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 pr-10 text-on-canvas text-sm
                             placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? t('shared.hidePassword') : t('shared.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-canvas-muted hover:text-on-canvas-subtle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="register-confirm" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('register.confirmPassword')}</label>
              <input
                id="register-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder={t('register.confirmPlaceholder')}
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
              {loading ? t('register.submitting') : t('register.submit')}
            </button>
          </form>

          <p className="text-center text-on-canvas-muted text-xs mt-6">
            <Trans t={t} i18nKey="register.haveAccount"
              components={{ cta: <Link to="/login" className="text-portal-accent hover:underline" /> }} />
          </p>
        </div>
      </div>
    </div>
  )
}
