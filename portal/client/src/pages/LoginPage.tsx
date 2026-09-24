import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState, FormEvent } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function LoginPage() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.login'))
  const { user, login } = useAuth()
  const { t } = useTranslation('auth')
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
      setError(err.message ?? t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* In normal flow (not absolutely positioned) so it can never overlap the
            logo on short or narrow screens. */}
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
          <h2 className="text-on-canvas text-xl font-semibold mb-1">{t('login.title')}</h2>
          <p className="text-on-canvas-muted text-sm mb-6">{t('login.subtitle')}</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('shared.email')}</label>
              <input
                id="login-email"
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
              <label htmlFor="login-password" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('shared.password')}</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
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
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-on-canvas-muted text-xs">
              <Trans t={t} i18nKey="login.noAccount"
                components={{ cta: <Link to="/register" className="text-portal-accent hover:underline" /> }} />
            </p>
            <p className="text-on-canvas-muted text-xs">
              <Link to="/forgot-password" className="text-on-canvas-muted hover:text-on-canvas-subtle">
                {t('login.forgot')}
              </Link>
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-portal-border text-center">
            <p className="text-on-canvas-muted text-xs">
              <Trans t={t} i18nKey="login.employee"
                components={{ cta: <Link to="/employee-login" className="text-portal-accent hover:underline" /> }} />
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
