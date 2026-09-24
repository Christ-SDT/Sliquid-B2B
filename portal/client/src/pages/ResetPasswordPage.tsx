import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState, FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, Lock, ArrowLeft, CheckCircle2, Eye, EyeOff, Clock, MailOpen } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function ResetPasswordPage() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.resetPassword'))
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [expired, setExpired] = useState(!token)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError(t('reset.errors.mismatch')); return }
    if (password.length < 8) { setError(t('reset.errors.short')); return }

    setLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Matched against the server's English wording to detect an expired token;
        // only the fallback shown to the user is translated.
        const msg: string = data.message ?? t('shared.genericError')
        if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
          setExpired(true); return
        }
        throw new Error(msg)
      }
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? t('shared.genericError'))
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

        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          {expired ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <Clock className="w-8 h-8 text-amber-400" />
                </div>
              </div>
              <h2 className="text-on-canvas text-xl font-semibold mb-3">{t('reset.expired.title')}</h2>
              <p className="text-on-canvas-subtle text-sm mb-4">
                {t('reset.expired.body')}
              </p>
              <div className="flex items-start gap-2.5 bg-portal-accent/5 border border-portal-border rounded-lg px-4 py-3 mb-6 text-left">
                <MailOpen className="w-4 h-4 text-portal-accent flex-shrink-0 mt-0.5" />
                <p className="text-on-canvas-muted text-xs leading-relaxed">
                  <Trans t={t} i18nKey="reset.expired.spamTip"
                    components={{ bold: <span className="text-on-canvas font-medium" /> }} />
                </p>
              </div>
              <Link
                to="/forgot-password"
                className="block w-full bg-portal-accent hover:bg-portal-accent/90 text-white font-semibold
                           py-2.5 rounded-lg transition-colors text-sm text-center"
              >
                {t('reset.expired.request')}
              </Link>
              <div className="mt-4">
                <Link
                  to="/login"
                  className="text-on-canvas-muted hover:text-on-canvas-subtle text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('shared.backToSignIn')}
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-on-canvas text-xl font-semibold mb-3">{t('reset.done.title')}</h2>
              <p className="text-on-canvas-subtle text-sm mb-8">
                {t('reset.done.body')}
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-portal-accent hover:bg-portal-accent/90 text-white font-semibold
                           py-2.5 rounded-lg transition-colors text-sm"
              >
                {t('reset.done.signIn')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-portal-accent/10 mb-5">
                <Lock className="w-5 h-5 text-portal-accent" />
              </div>
              <h2 className="text-on-canvas text-xl font-semibold mb-1">{t('reset.title')}</h2>
              <p className="text-on-canvas-muted text-sm mb-6">
                {t('reset.subtitle')}
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="reset-password" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('reset.newPassword')}</label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoFocus
                      className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 pr-10 text-on-canvas text-sm
                                 placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? t('shared.hidePassword') : t('shared.showPassword')}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-canvas-muted hover:text-on-canvas-subtle transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reset-confirm" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('reset.confirmPassword')}</label>
                  <input
                    id="reset-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
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
                  {loading ? t('reset.submitting') : t('reset.submit')}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="text-on-canvas-muted hover:text-on-canvas-subtle text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('shared.backToSignIn')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
