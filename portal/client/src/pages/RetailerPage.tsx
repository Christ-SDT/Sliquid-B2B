import { useState, FormEvent } from 'react'
import { api } from '@/api/client'
import { CheckCircle, ChevronRight, Store, HelpCircle } from 'lucide-react'

const STEPS = ['Business Info', 'Contact Details', 'Revenue & Discovery', 'Review & Submit']

const FAQS = [
  { q: 'How long does the approval process take?', a: 'We review all applications within 3–5 business days and respond via email.' },
  { q: 'What types of businesses qualify?', a: 'Retail stores, spas, salons, clinics, and adult boutiques with a physical or established online presence.' },
  { q: 'Is there a minimum order requirement?', a: 'Yes, a $250 minimum opening order is required. Ongoing minimum reorder is $150.' },
  { q: 'Do you offer exclusivity?', a: 'Exclusivity is available in some markets — contact your Sliquid rep to discuss.' },
]

interface FormData {
  business_name: string
  business_type: string
  contact_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  website: string
  annual_revenue: string
  how_heard: string
}

const EMPTY: FormData = {
  business_name: '', business_type: '', contact_name: '', email: '',
  phone: '', address: '', city: '', state: '', zip: '',
  website: '', annual_revenue: '', how_heard: '',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', required = false }:
  { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                 placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
    />
  )
}

export default function RetailerPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof FormData) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (step < STEPS.length - 1) { setStep(s => s + 1); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/retailer/apply', form)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message ?? 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-on-canvas text-2xl font-bold mb-3">Application Submitted!</h2>
        <p className="text-on-canvas-subtle mb-6">
          Thanks! We received your application for <strong className="text-on-canvas">{form.business_name}</strong>.
          A member of our team will reach out within 3–5 business days.
        </p>
        <div className="bg-surface border border-portal-border rounded-xl p-5 text-left space-y-2">
          <p className="text-on-canvas-muted text-xs font-semibold uppercase tracking-wider mb-3">What happens next</p>
          {['Application review by our partner team', 'Email confirmation with next steps', 'Account setup + onboarding call', 'First order placement'].map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-portal-accent/20 text-portal-accent text-xs font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <p className="text-on-canvas-subtle text-sm">{s}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Store className="w-5 h-5 text-portal-accent" />
          <h1 className="text-on-canvas text-2xl font-bold">Become a Retailer</h1>
        </div>
        <p className="text-on-canvas-muted text-sm">Apply to carry Sliquid, RIDE, and Ride Rocco products in your store.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
              ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-portal-accent text-white' : 'bg-surface-elevated text-on-canvas-muted'}`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block flex-1 ${i === step ? 'text-on-canvas' : 'text-on-canvas-muted'}`}>{label}</span>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-on-canvas flex-shrink-0" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-surface border border-portal-border rounded-xl p-6 space-y-4">
          <h2 className="text-on-canvas font-semibold text-lg">{STEPS[step]}</h2>

          {step === 0 && (
            <>
              <Field label="Business Name *"><Input value={form.business_name} onChange={set('business_name')} placeholder="Your store name" required /></Field>
              <Field label="Business Type">
                <select value={form.business_type} onChange={e => set('business_type')(e.target.value)}
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors">
                  <option value="">Select type…</option>
                  {['Adult Boutique', 'Spa / Wellness', 'Medical / Clinical', 'Pharmacy', 'Online Retailer', 'General Retail', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Address"><Input value={form.address} onChange={set('address')} placeholder="123 Main St" /></Field>
                <Field label="City"><Input value={form.city} onChange={set('city')} placeholder="City" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State"><Input value={form.state} onChange={set('state')} placeholder="CA" /></Field>
                <Field label="ZIP"><Input value={form.zip} onChange={set('zip')} placeholder="90210" /></Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Contact Name *"><Input value={form.contact_name} onChange={set('contact_name')} placeholder="Full name" required /></Field>
              <Field label="Email *"><Input value={form.email} onChange={set('email')} type="email" placeholder="email@store.com" required /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={set('phone')} type="tel" placeholder="(555) 000-0000" /></Field>
              <Field label="Website"><Input value={form.website} onChange={set('website')} type="url" placeholder="https://yourstore.com" /></Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Annual Revenue (approximate)">
                <select value={form.annual_revenue} onChange={e => set('annual_revenue')(e.target.value)}
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors">
                  <option value="">Select range…</option>
                  {['Under $100K', '$100K – $500K', '$500K – $1M', '$1M – $5M', 'Over $5M'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="How did you hear about Sliquid?">
                <select value={form.how_heard} onChange={e => set('how_heard')(e.target.value)}
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors">
                  <option value="">Select…</option>
                  {['Trade Show', 'Distributor', 'Existing Partner', 'Online Search', 'Social Media', 'Word of Mouth', 'Other'].map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            </>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-on-canvas-subtle text-sm">Please review your application before submitting:</p>
              {[
                ['Business', form.business_name, form.business_type],
                ['Location', [form.city, form.state, form.zip].filter(Boolean).join(', ')],
                ['Contact', form.contact_name, form.email, form.phone],
                ['Website', form.website],
                ['Annual Revenue', form.annual_revenue],
              ].map(([label, ...vals]) => (
                <div key={String(label)} className="flex justify-between py-2 border-b border-portal-border/50">
                  <span className="text-on-canvas-muted text-sm">{label}</span>
                  <span className="text-on-canvas text-sm text-right">{vals.filter(Boolean).join(' · ') || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="px-5 py-2.5 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm font-medium transition-colors">
                Back
              </button>
            )}
            <button type="submit" disabled={loading}
              className="flex-1 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60 text-white font-semibold
                         py-2.5 rounded-lg transition-colors text-sm">
              {step < STEPS.length - 1 ? 'Continue' : loading ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </div>
      </form>

      {/* FAQ */}
      <div className="bg-surface border border-portal-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-4 h-4 text-on-canvas-muted" />
          <h3 className="text-on-canvas font-semibold">Frequently Asked Questions</h3>
        </div>
        <div className="space-y-4">
          {FAQS.map(({ q, a }) => (
            <div key={q}>
              <p className="text-on-canvas text-sm font-medium mb-1">{q}</p>
              <p className="text-on-canvas-muted text-sm">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
