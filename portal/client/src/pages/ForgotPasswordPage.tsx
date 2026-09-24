import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'

export default function ForgotPasswordPage() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.forgotPassword'))
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? t('shared.genericError'))
      }
      setSent(true)
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
          {sent ? (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-on-canvas text-xl font-semibold mb-3">{t('forgot.sent.title')}</h2>
              <p className="text-on-canvas-subtle text-sm leading-relaxed mb-2">
                <Trans t={t} i18nKey="forgot.sent.body" values={{ email }}
                  components={{ bold: <span className="text-on-canvas font-medium" /> }} />
              </p>
              <p className="text-on-canvas-muted text-xs mb-8">
                {t('forgot.sent.spam')}
              </p>
              <Link
                to="/login"
                className="text-on-canvas-muted hover:text-on-canvas-subtle text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('shared.backToSignIn')}
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-portal-accent/10 mb-5">
                <Mail className="w-5 h-5 text-portal-accent" />
              </div>
              <h2 className="text-on-canvas text-xl font-semibold mb-1">{t('forgot.title')}</h2>
              <p className="text-on-canvas-muted text-sm mb-6">
                {t('forgot.subtitle')}
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{t('forgot.email')}</label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('forgot.emailPlaceholder')}
                    required
                    autoFocus
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
                  {loading ? t('forgot.submitting') : t('forgot.submit')}
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
