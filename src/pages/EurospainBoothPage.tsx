import { useState, useEffect, useId } from 'react'
import { sanitizeFormData } from '@/utils/sanitize'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sliquid-b2b-production.up.railway.app'

const BUSINESS_TYPES = ['Retailer', 'Distribution', 'E-Commerce', 'Other']

interface FormData {
  name: string
  email: string
  businessName: string
  businessType: string
  storeNames: string
  storeCount: string
  contactName: string
  gdprConsent: boolean
}

interface FormErrors {
  name?: string
  email?: string
  businessName?: string
  businessType?: string
  storeNames?: string
  contactName?: string
  gdprConsent?: string
}

const EMPTY: FormData = {
  name: '',
  email: '',
  businessName: '',
  businessType: '',
  storeNames: '',
  storeCount: '',
  contactName: '',
  gdprConsent: false,
}

function validate(d: FormData): FormErrors {
  const err: FormErrors = {}
  if (!d.name.trim()) err.name = 'Full name is required.'
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = 'A valid email address is required.'
  if (!d.businessName.trim()) err.businessName = 'Business name is required.'
  if (!d.businessType) err.businessType = 'Please select a business type.'
  if (d.businessType === 'Retailer' && !d.storeNames.trim()) err.storeNames = 'Please enter your store name(s).'
  if (!d.contactName.trim()) err.contactName = 'Contact name is required.'
  if (!d.gdprConsent) err.gdprConsent = 'You must consent to continue.'
  return err
}

function FieldError({ message }: { message: string }) {
  return <p role="alert" className="mt-1 text-red-500 text-xs">{message}</p>
}

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-4 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400
   focus:outline-none focus:ring-2 focus:ring-sliquid-blue/30 transition
   ${hasError ? 'border-red-400' : 'border-gray-300 focus:border-sliquid-blue'}`

export default function EurospainBoothPage() {
  const uid = useId()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sendError, setSendError] = useState('')
  const [countdown, setCountdown] = useState(5)

  // 5-second countdown after success → reset
  useEffect(() => {
    if (!submitted) return
    setCountdown(5)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setSubmitted(false)
          setForm(EMPTY)
          return 5
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [submitted])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true)
    setSendError('')
    try {
      const safe = sanitizeFormData(form)
      const res = await fetch(`${API_BASE}/api/b2b/booth-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         safe.name,
          email:        safe.email,
          businessName: safe.businessName,
          businessType: safe.businessType,
          storeNames:   safe.storeNames || undefined,
          storeCount:   safe.storeCount || undefined,
          contactName:  safe.contactName,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(data.message ?? 'Submission failed')
      }
      setSubmitted(true)
    } catch (err: any) {
      setSendError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-off-white py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto">

        {/* Logo / Header */}
        <div className="text-center mb-8">
          <p className="text-sliquid-blue text-xs font-bold uppercase tracking-widest mb-1">Eurospain 2026</p>
          <h1 className="text-text-dark text-3xl font-bold tracking-tight">Partner Intake Form</h1>
          <p className="text-text-gray text-sm mt-2">
            Fill out the form below and we'll be in touch. You will receive a confirmation email to complete your sign-up.
          </p>
        </div>

        {/* Success state */}
        {submitted ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-text-dark text-2xl font-bold mb-3">Thank You!</h2>
            <p className="text-text-gray text-sm leading-relaxed mb-2">
              Thanks for filling out our intake form. Please check your inbox for a confirmation email — you'll need to click the link to complete your sign-up.
            </p>
            <p className="text-text-gray text-sm leading-relaxed mb-6">
              If you don't see it, check your spam folder.
            </p>
            <p className="text-text-light-gray text-xs">
              This form will reset in <span className="font-semibold text-sliquid-blue">{countdown}</span> second{countdown !== 1 ? 's' : ''}…
            </p>
          </div>
        ) : (

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">

            {/* GDPR notice banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-xs text-blue-800 leading-relaxed">
              <strong>Important — Double Opt-In &amp; GDPR:</strong> By submitting this form you are expressing interest in receiving communications from Sliquid. You will receive a separate confirmation email which you <strong>must click</strong> to complete your sign-up. You may unsubscribe at any time. We process your data in accordance with GDPR. We will never sell or share your information.
            </div>

            {sendError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-5">
                {sendError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Name */}
              <div>
                <label htmlFor={`${uid}-name`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-name`} name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder="Jane Doe"
                  className={inputCls(!!errors.name)} />
                {errors.name && <FieldError message={errors.name} />}
              </div>

              {/* Email */}
              <div>
                <label htmlFor={`${uid}-email`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-email`} name="email" type="email" value={form.email}
                  onChange={handleChange} placeholder="jane@yourbusiness.com"
                  className={inputCls(!!errors.email)} />
                {errors.email && <FieldError message={errors.email} />}
              </div>

              {/* Business Name */}
              <div>
                <label htmlFor={`${uid}-businessName`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-businessName`} name="businessName" type="text" value={form.businessName}
                  onChange={handleChange} placeholder="Your Company Ltd."
                  className={inputCls(!!errors.businessName)} />
                {errors.businessName && <FieldError message={errors.businessName} />}
              </div>

              {/* Business Type */}
              <div>
                <label htmlFor={`${uid}-businessType`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  Type of Business <span className="text-red-500">*</span>
                </label>
                <select id={`${uid}-businessType`} name="businessType" value={form.businessType}
                  onChange={handleChange} className={inputCls(!!errors.businessType)}>
                  <option value="">Select type…</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.businessType && <FieldError message={errors.businessType} />}
              </div>

              {/* Retailer-only fields */}
              {form.businessType === 'Retailer' && (
                <div className="space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div>
                    <label htmlFor={`${uid}-storeNames`} className="block text-sm font-semibold text-text-dark mb-1.5">
                      Store Name(s) <span className="text-red-500">*</span>
                    </label>
                    <input id={`${uid}-storeNames`} name="storeNames" type="text" value={form.storeNames}
                      onChange={handleChange} placeholder="e.g. Main Street Boutique, City Plaza"
                      className={inputCls(!!errors.storeNames)} />
                    {errors.storeNames && <FieldError message={errors.storeNames} />}
                  </div>
                  <div>
                    <label htmlFor={`${uid}-storeCount`} className="block text-sm font-semibold text-text-dark mb-1.5">
                      Number of Stores
                    </label>
                    <input id={`${uid}-storeCount`} name="storeCount" type="number" min="1"
                      value={form.storeCount} onChange={handleChange} placeholder="e.g. 3"
                      className={inputCls()} />
                  </div>
                </div>
              )}

              {/* Contact Name */}
              <div>
                <label htmlFor={`${uid}-contactName`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  Company Contact Name <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-contactName`} name="contactName" type="text" value={form.contactName}
                  onChange={handleChange} placeholder="Primary contact for your company"
                  className={inputCls(!!errors.contactName)} />
                {errors.contactName && <FieldError message={errors.contactName} />}
              </div>

              {/* GDPR consent */}
              <div className="pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" name="gdprConsent" checked={form.gdprConsent}
                    onChange={handleChange} className="mt-0.5 w-4 h-4 accent-sliquid-blue flex-shrink-0" />
                  <span className="text-xs text-text-gray leading-relaxed">
                    I consent to Sliquid storing and using my information to send me product updates and marketing communications. I understand I will receive a confirmation email to complete my sign-up, and I can unsubscribe at any time by clicking the unsubscribe link in any email I receive. <span className="text-red-500">*</span>
                  </span>
                </label>
                {errors.gdprConsent && <FieldError message={errors.gdprConsent} />}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60
                           text-white font-semibold text-sm py-3.5 rounded-lg transition-colors
                           flex items-center justify-center gap-2"
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {submitting ? 'Submitting…' : 'Submit'}
              </button>

            </form>
          </div>
        )}

        <p className="text-center text-xs text-text-light-gray mt-6">
          © {new Date().getFullYear()} Sliquid, LLC · All rights reserved
        </p>
      </div>
    </div>
  )
}
