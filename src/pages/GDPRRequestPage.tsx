import { useState, useId } from 'react'
import { sanitizeFormData } from '@/utils/sanitize'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sliquid-b2b-production.up.railway.app'

type RequestType = 'access' | 'deletion'

interface FormData { name: string; email: string; message: string }
interface FormErrors { name?: string; email?: string }

const EMPTY: FormData = { name: '', email: '', message: '' }

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-4 py-2.5 text-sm text-text-dark placeholder:text-text-light-gray bg-white
   focus:outline-none focus:ring-2 focus:ring-sliquid-blue/30 transition
   ${hasError ? 'border-red-400' : 'border-gray-200 focus:border-sliquid-blue'}`

function RequestForm({ type, onSuccess }: { type: RequestType; onSuccess: () => void }) {
  const uid = useId()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [sendError, setSendError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  function validate(): boolean {
    const err: FormErrors = {}
    if (!form.name.trim()) err.name = 'Full name is required.'
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(form.email)) err.email = 'A valid email address is required.'
    setErrors(err)
    return Object.keys(err).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true); setSendError('')
    try {
      const safe = sanitizeFormData(form)
      const res = await fetch(`${API_BASE}/api/gdpr/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: safe.name, email: safe.email, message: safe.message || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(data.message ?? 'Submission failed')
      }
      onSuccess()
    } catch (err: any) {
      setSendError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {sendError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{sendError}</div>
      )}
      <div>
        <label htmlFor={`${uid}-name`} className="block text-sm font-semibold text-text-dark mb-1.5">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input id={`${uid}-name`} name="name" type="text" value={form.name}
          onChange={handleChange} placeholder="Jane Doe"
          className={inputCls(!!errors.name)} />
        {errors.name && <p role="alert" className="mt-1 text-red-600 text-xs">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor={`${uid}-email`} className="block text-sm font-semibold text-text-dark mb-1.5">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input id={`${uid}-email`} name="email" type="email" value={form.email}
          onChange={handleChange} placeholder="you@example.com"
          className={inputCls(!!errors.email)} />
        {errors.email && <p role="alert" className="mt-1 text-red-600 text-xs">{errors.email}</p>}
      </div>
      <div>
        <label htmlFor={`${uid}-message`} className="block text-sm font-semibold text-text-dark mb-1.5">
          Additional Details <span className="text-text-light-gray font-normal text-xs">(optional)</span>
        </label>
        <textarea id={`${uid}-message`} name="message" rows={3} value={form.message}
          onChange={handleChange}
          placeholder={type === 'access' ? 'Describe what data you would like to access…' : 'Any additional context for your deletion request…'}
          className={`${inputCls()} resize-none`} />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60
                   text-white font-semibold text-sm py-3 px-8 rounded-lg transition-colors flex items-center gap-2"
      >
        {submitting && (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {submitting ? 'Submitting…' : type === 'access' ? 'Submit Data Request' : 'Submit Deletion Request'}
      </button>
    </form>
  )
}

function SuccessPanel({ type, onReset }: { type: RequestType; onReset: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-14 h-14 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-text-dark text-xl font-bold mb-2">Request Received</h3>
      <p className="text-text-gray text-sm leading-relaxed max-w-sm mx-auto mb-5">
        {type === 'access'
          ? 'We have received your data access request. We will respond within 30 days in accordance with GDPR Article 15.'
          : 'We have received your deletion request. We will process it within 30 days in accordance with GDPR Article 17. This includes removing your data from Mailchimp and our systems.'
        }
      </p>
      <button onClick={onReset} className="text-sliquid-blue text-sm hover:underline font-medium">
        Submit another request
      </button>
    </div>
  )
}

export default function GDPRRequestPage() {
  const [activeTab, setActiveTab] = useState<RequestType>('access')
  const [accessDone, setAccessDone] = useState(false)
  const [deletionDone, setDeletionDone] = useState(false)

  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">GDPR</p>
          <h1 className="text-text-dark text-[38px] font-semibold tracking-[-0.5px] leading-tight mb-3">
            Your Data Rights
          </h1>
          <p className="text-text-gray text-base leading-relaxed max-w-2xl">
            Under the General Data Protection Regulation (GDPR) you have the right to access the personal data we hold about you,
            and the right to request its deletion. Use the forms below to exercise either right.
          </p>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto space-y-12">

          {/* How we hold your data */}
          <div className="bg-bg-off-white rounded-2xl p-8 border border-gray-100">
            <h2 className="text-text-dark text-xl font-semibold mb-4">How We Hold Your Data</h2>
            <div className="space-y-3 text-text-gray text-sm leading-relaxed">
              <p>
                Sliquid uses <strong className="text-text-dark">Mailchimp</strong> (operated by The Rocket Science Group, LLC) as our email marketing platform.
                When you sign up to receive communications from us through our website, a trade show, or another channel,
                your name, email address, and any associated preferences are stored in Mailchimp's systems.
                Mailchimp processes this data on our behalf under a data processing agreement compliant with GDPR.
              </p>
              <p>
                In addition to Mailchimp, we may store submission data (such as retailer applications, contact form entries,
                and booth intake forms) in our own secure database hosted on Railway infrastructure in order to fulfil your request
                and maintain a record of consent.
              </p>
              <p>
                We do not sell your personal data to any third party. For full details, see our{' '}
                <a href="/privacy-policy" className="text-sliquid-blue hover:underline font-medium">Privacy Policy</a>.
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div>
            <div className="flex gap-3 mb-8">
              {(['access', 'deletion'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors
                    ${activeTab === tab
                      ? 'bg-sliquid-blue text-white'
                      : 'bg-bg-off-white text-text-gray border border-gray-200 hover:border-sliquid-blue hover:text-sliquid-blue'
                    }`}
                >
                  {tab === 'access' ? 'Request My Data' : 'Request Deletion'}
                </button>
              ))}
            </div>

            {/* Access form */}
            {activeTab === 'access' && (
              <div className="max-w-lg">
                <div className="mb-6">
                  <h2 className="text-text-dark text-2xl font-semibold mb-2">Request Access to Your Data</h2>
                  <p className="text-text-gray text-sm leading-relaxed">
                    Under GDPR Article 15 you have the right to obtain confirmation of whether we process your personal data,
                    and to receive a copy of it. We will respond within <strong>30 days</strong>. Your request will also be
                    forwarded to Mailchimp to retrieve any data held there on your behalf.
                  </p>
                </div>
                {accessDone
                  ? <SuccessPanel type="access" onReset={() => setAccessDone(false)} />
                  : <RequestForm type="access" onSuccess={() => setAccessDone(true)} />
                }
              </div>
            )}

            {/* Deletion form */}
            {activeTab === 'deletion' && (
              <div className="max-w-lg">
                <div className="mb-6">
                  <h2 className="text-text-dark text-2xl font-semibold mb-2">Request Deletion of Your Data</h2>
                  <p className="text-text-gray text-sm leading-relaxed mb-3">
                    Under GDPR Article 17 ("right to be forgotten") you may request that we erase your personal data.
                    We will process your request within <strong>30 days</strong> and confirm once complete.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800 text-xs leading-relaxed">
                    <strong>What gets deleted:</strong> Your data will be removed from our Mailchimp audience and from our
                    internal database. Note that we may be required to retain certain records for legal or contractual obligations
                    (e.g. order history), in which case we will inform you of what cannot be deleted and why.
                  </div>
                </div>
                {deletionDone
                  ? <SuccessPanel type="deletion" onReset={() => setDeletionDone(false)} />
                  : <RequestForm type="deletion" onSuccess={() => setDeletionDone(true)} />
                }
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="border-t border-gray-100 pt-10 pb-4">
            <h2 className="text-text-dark text-lg font-semibold mb-2">Questions About Your Data?</h2>
            <p className="text-text-gray text-sm leading-relaxed">
              If you have questions about how we process your data or need to escalate a request, contact us directly at{' '}
              <a href="mailto:sales@sliquid.com" className="text-sliquid-blue hover:underline font-medium">sales@sliquid.com</a>.
              You also have the right to lodge a complaint with your local data protection authority.
            </p>
          </div>

        </div>
      </section>
    </div>
  )
}
