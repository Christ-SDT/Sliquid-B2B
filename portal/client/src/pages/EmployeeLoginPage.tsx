import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'

// Error codes the SSO callback may bounce back with → key under employee.errors.
// Several codes share one message; unknown codes fall back to `generic`.
const SSO_ERROR_KEYS: Record<string, string> = {
  sso_unavailable: 'sso_unavailable',
  missing_code: 'missing_code',
  missing_state: 'sessionExpired',
  invalid_state: 'sessionExpired',
  state_mismatch: 'state_mismatch',
  token_exchange_failed: 'exchangeFailed',
  no_id_token: 'exchangeFailed',
  no_email: 'no_email',
  verification_failed: 'verification_failed',
  access_denied: 'access_denied',
}

export default function EmployeeLoginPage() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.employeeLogin'))
  const { user } = useAuth()
  const { t } = useTranslation('auth')
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const errorCode = params.get('sso_error')
  const error = errorCode ? t(`employee.errors.${SSO_ERROR_KEYS[errorCode] ?? 'generic'}`) : ''

  function startSso() {
    setLoading(true)
    // Full-page navigation to the server, which begins the OIDC redirect dance.
    window.location.href = `${import.meta.env.VITE_API_URL ?? ''}/auth/google/login`
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
          <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">{t('brand.employeePortal')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8">
          <h2 className="text-on-canvas text-xl font-semibold mb-1">{t('employee.title')}</h2>
          <p className="text-on-canvas-muted text-sm mb-6">
            {t('employee.subtitle')}
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
            {loading ? t('employee.redirecting') : t('employee.submit')}
          </button>

          <p className="text-on-canvas-muted text-xs text-center mt-6">
            <Trans t={t} i18nKey="employee.notEmployee"
              components={{ cta: <Link to="/login" className="text-portal-accent hover:underline" /> }} />
          </p>
        </div>
      </div>
    </div>
  )
}
