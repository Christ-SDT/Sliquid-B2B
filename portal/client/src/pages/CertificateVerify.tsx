import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, Search, RotateCcw } from 'lucide-react'

interface VerifyResult {
  valid: boolean
  fullName?: string
  completionDate?: string
  certificateNumber?: string
  message?: string
}

export default function CertificateVerify() {
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
      setResult({ valid: false, message: 'Failed to reach the verification server.' })
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

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-portal-accent/10 border border-portal-accent/20 rounded-full text-portal-accent text-xs font-medium tracking-widest mb-4">
            SLIQUID
          </div>
          <h1 className="text-on-canvas text-2xl font-bold">Certificate Verification</h1>
          <p className="text-on-canvas-muted text-sm mt-1">
            Enter a certificate number to verify its authenticity.
          </p>
        </div>

        {/* Search form */}
        <div className="bg-surface border border-portal-border rounded-xl shadow-lg p-6 mb-4">
          <form onSubmit={handleVerify} className="space-y-3">
            <label className="block text-on-canvas-subtle text-xs font-medium mb-1">
              Certificate Number
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="e.g. SLQ-2025-A3F7B2"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5
                           text-on-canvas text-sm font-mono placeholder:text-on-canvas-muted
                           focus:outline-none focus:border-portal-accent transition-colors"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-portal-accent hover:bg-portal-accent/90
                           disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Search className="w-4 h-4" />
                }
                {loading ? 'Checking…' : 'Verify'}
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
                    <p className="text-emerald-400 font-semibold text-base">Certificate Verified</p>
                    <p className="text-emerald-600/80 text-xs mt-0.5">This is an authentic Sliquid certificate</p>
                  </div>
                </div>

                {/* Details */}
                <div className="px-6 pt-4 pb-2">
                  {([
                    ['Issued To',     result.fullName ?? ''],
                    ['Completed',     result.completionDate ?? ''],
                    ['Certificate #', result.certificateNumber ?? ''],
                    ['Program',       'Sliquid Certified Expert Course'],
                    ['Issued By',     'Sliquid, LLC  •  Dallas, TX'],
                    ['Status',        '✓ Valid'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between items-start py-3 border-b border-portal-border last:border-0 gap-4">
                      <span className="text-on-canvas-muted text-sm flex-shrink-0">{label}</span>
                      <span className={`text-sm font-medium text-right ${label === 'Status' ? 'text-emerald-400' : 'text-on-canvas'}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="px-6 pb-5 pt-2">
                  <p className="text-on-canvas-muted text-xs text-center leading-relaxed">
                    This individual has completed all required modules of the Sliquid Certified Expert Course
                    and demonstrated expert-level product knowledge.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Not found header */}
                <div className="bg-red-900/20 border-b border-red-700/30 px-6 py-5 flex items-center gap-3">
                  <XCircle className="w-7 h-7 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-400 font-semibold text-base">Certificate Not Found</p>
                    <p className="text-red-600/80 text-xs mt-0.5">This certificate could not be verified</p>
                  </div>
                </div>

                <div className="px-6 pt-4 pb-2">
                  <div className="flex justify-between items-center py-3 border-b border-portal-border">
                    <span className="text-on-canvas-muted text-sm">Certificate #</span>
                    <span className="text-on-canvas text-sm font-mono">{searched}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-on-canvas-muted text-sm">Status</span>
                    <span className="text-red-400 text-sm font-medium">✗ Not Found</span>
                  </div>
                </div>

                <div className="px-6 pb-5 pt-2">
                  <p className="text-on-canvas-muted text-xs text-center leading-relaxed">
                    No valid certificate matches that number. Please double-check the certificate number and try again.
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
                <RotateCcw className="w-3.5 h-3.5" /> Search another certificate
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6">
          <Link to="/login" className="text-portal-accent hover:underline text-sm">
            Sign in to the Sliquid B2B Portal →
          </Link>
        </div>

      </div>
    </div>
  )
}
