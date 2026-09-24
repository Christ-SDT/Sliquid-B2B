import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, Search, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '@/components/LanguageSwitcher'

interface VerifyResult {
  valid: boolean
  fullName?: string
  completionDate?: string
  certificateNumber?: string
  message?: string
  /** Client-side network failure — rendered via t() so it follows a language switch. */
  networkError?: boolean
}

export default function CertificateVerify() {
  const { t: tCommon } = useTranslation('common')
  useDocumentTitle(tCommon('titles.verify'))
  const { t } = useTranslation('verify')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState('')

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const certNumber = input.trim().toUpperCase()
    if (!certNumber) return
    setLoading(true)
    setResult(null)
    setSearched(certNumber)
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    try {
      const res = await fetch(`${apiUrl}/api/certificates/verify/${certNumber}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ valid: false, networkError: true })
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setResult(null)
    setSearched('')
    setInput('')
  }

  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-portal-accent/10 border border-portal-accent/20 rounded-full text-portal-accent text-xs font-medium tracking-widest mb-4">
            SLIQUID
          </div>
          <h1 className="text-on-canvas text-2xl font-bold">{t('title')}</h1>
          <p className="text-on-canvas-muted text-sm mt-1">
            {t('subtitle')}
          </p>
        </div>

        {/* Search form */}
        <div className="bg-surface border border-portal-border rounded-xl shadow-lg p-6 mb-4">
          <form onSubmit={handleVerify} className="space-y-3">
            <label htmlFor="verify-cert-number" className="block text-on-canvas-subtle text-xs font-medium mb-1">
              {t('label')}
            </label>
            <div className="flex gap-2">
              <input
                id="verify-cert-number"
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={t('placeholder')}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5
                           text-on-canvas text-sm font-mono placeholder:text-on-canvas-muted
                           focus:outline-none focus:border-portal-accent transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-portal-accent hover:bg-portal-accent/90
                           disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Search className="w-4 h-4" />
                }
                {loading ? t('checking') : t('submit')}
              </button>
            </div>
          </form>
        </div>

        {/* Result card */}
        {result && (
          <div className="bg-surface border border-portal-border rounded-xl shadow-lg overflow-hidden">
            {result.valid ? (
              <>
                {/* Verified header */}
                <div className="bg-emerald-900/20 border-b border-emerald-700/30 px-6 py-5 flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-emerald-400 font-semibold text-base">{t('valid.title')}</p>
                    <p className="text-emerald-600/80 text-xs mt-0.5">{t('valid.subtitle')}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="px-6 pt-4 pb-2">
                  {/* The program name and issuer are proper names printed on the
                      certificate itself, so they stay untranslated. */}
                  {([
                    ['issuedTo',  result.fullName ?? ''],
                    ['completed', result.completionDate ?? ''],
                    ['number',    result.certificateNumber ?? ''],
                    ['program',   'Sliquid Certified Expert Course'],
                    ['issuedBy',  'Sliquid, LLC  •  Dallas, TX'],
                    ['status',    t('valid.statusValue')],
                  ] as [string, string][]).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start py-3 border-b border-portal-border last:border-0 gap-4">
                      <span className="text-on-canvas-muted text-sm flex-shrink-0">{t(`valid.${key}`)}</span>
                      <span className={`text-sm font-medium text-right ${key === 'status' ? 'text-emerald-400' : 'text-on-canvas'}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-5 pt-2">
                  <p className="text-on-canvas-muted text-xs text-center leading-relaxed">
                    {t('valid.note')}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Not found header */}
                <div className="bg-red-900/20 border-b border-red-700/30 px-6 py-5 flex items-center gap-3">
                  <XCircle className="w-7 h-7 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-400 font-semibold text-base">{t('invalid.title')}</p>
                    <p className="text-red-600/80 text-xs mt-0.5">{result.networkError ? t('serverError') : t('invalid.subtitle')}</p>
                  </div>
                </div>

                <div className="px-6 pt-4 pb-2">
                  <div className="flex justify-between items-center py-3 border-b border-portal-border">
                    <span className="text-on-canvas-muted text-sm">{t('valid.number')}</span>
                    <span className="text-on-canvas text-sm font-mono">{searched}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-on-canvas-muted text-sm">{t('valid.status')}</span>
                    <span className="text-red-400 text-sm font-medium">{t('invalid.statusValue')}</span>
                  </div>
                </div>

                <div className="px-6 pb-5 pt-2">
                  <p className="text-on-canvas-muted text-xs text-center leading-relaxed">
                    {t('invalid.note')}
                  </p>
                </div>
              </>
            )}

            {/* Search again */}
            <div className="px-6 pb-5">
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 py-2 border border-portal-border
                           text-on-canvas-subtle hover:text-on-canvas rounded-lg text-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t('searchAgain')}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6">
          <Link to="/login" className="text-portal-accent hover:underline text-sm">
            {t('signIn')}
          </Link>
        </div>

      </div>
    </div>
  )
}
