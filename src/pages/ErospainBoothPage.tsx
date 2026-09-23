import { useState, useEffect, useId } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { sanitizeFormData } from '@/utils/sanitize'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sliquid-b2b-production.up.railway.app'

// Submitted as-is (English) — sales and Mailchimp read these. Labels are translated
// via erospain:businessTypes.<value>.
const BUSINESS_TYPES = ['Retailer', 'Distribution', 'E-Commerce', 'Other']

interface FormData {
  name: string
  email: string
  businessName: string
  businessType: string
  storeNames: string
  storeCount: string
  websiteUrl: string
  contactName: string
  contactPhone: string
  gdprConsent: boolean
}

interface FormErrors {
  name?: string
  email?: string
  businessName?: string
  businessType?: string
  storeNames?: string
  websiteUrl?: string
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
  websiteUrl: '',
  contactName: '',
  contactPhone: '',
  gdprConsent: false,
}

// Returns translation keys (not text) so a message on screen follows a language switch.
function validate(d: FormData): FormErrors {
  const err: FormErrors = {}
  if (!d.name.trim()) err.name = 'errors.nameRequired'
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = 'errors.emailInvalid'
  if (!d.businessName.trim()) err.businessName = 'errors.businessNameRequired'
  if (!d.businessType) err.businessType = 'errors.businessTypeRequired'
  if (d.businessType === 'Retailer' && !d.storeNames.trim()) err.storeNames = 'errors.storeNamesRequired'
  if (d.businessType === 'E-Commerce' && !d.websiteUrl.trim()) err.websiteUrl = 'errors.websiteUrlRequired'
  if (!d.contactName.trim()) err.contactName = 'errors.contactNameRequired'
  if (!d.gdprConsent) err.gdprConsent = 'errors.consentRequired'
  return err
}

function FieldError({ message }: { message: string }) {
  const { t } = useTranslation('erospain')
  return <p role="alert" className="mt-1 text-red-500 text-xs">{t(message)}</p>
}

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-4 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400
   focus:outline-none focus:ring-2 focus:ring-sliquid-blue/30 transition
   ${hasError ? 'border-red-500' : 'border-gray-500 focus:border-sliquid-blue'}`

export default function ErospainBoothPage() {
  const { t } = useTranslation('erospain')
  const uid = useId()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // null = no error; '' = show the translated generic message; otherwise the
  // server's own message (already written for the visitor).
  const [sendError, setSendError] = useState<string | null>(null)
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
    setSendError(null)
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
          websiteUrl:   safe.websiteUrl || undefined,
          contactName:  safe.contactName,
          contactPhone: safe.contactPhone || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        setSendError(data.message ?? '')
        return
      }
      setSubmitted(true)
    } catch {
      // Network/CORS failure — the browser's error text is English and unhelpful.
      setSendError('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-off-white py-10 px-4 sm:px-6">
      <div className="max-w-lg mx-auto">

        {/* Logo / Header */}
        <div className="text-center mb-8">
          <p className="text-sliquid-blue text-xs font-bold uppercase tracking-widest mb-1">{t('header.eyebrow')}</p>
          <h1 className="text-text-dark text-3xl font-bold tracking-tight">{t('header.title')}</h1>
          <p className="text-text-gray text-sm mt-2">
            {t('header.intro')}
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
            <h2 className="text-text-dark text-2xl font-bold mb-3">{t('success.title')}</h2>
            <p className="text-text-gray text-sm leading-relaxed mb-2">
              {t('success.body')}
            </p>
            <p className="text-text-gray text-sm leading-relaxed mb-6">
              {t('success.spam')}
            </p>
            <p className="text-text-light-gray text-xs">
              <Trans
                t={t}
                i18nKey="success.reset"
                count={countdown}
                components={{ count: <span className="font-semibold text-sliquid-blue" /> }}
              />
            </p>
          </div>
        ) : (

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">

            {/* GDPR notice banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-xs text-blue-800 leading-relaxed">
              <Trans t={t} i18nKey="gdprNotice" components={{ bold: <strong /> }} />
            </div>

            {sendError !== null && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-5">
                {sendError || t('errors.generic')}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Name */}
              <div>
                <label htmlFor={`${uid}-name`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.name')} <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-name`} name="name" type="text" value={form.name}
                  onChange={handleChange} placeholder={t('fields.namePlaceholder')}
                  className={inputCls(!!errors.name)} />
                {errors.name && <FieldError message={errors.name} />}
              </div>

              {/* Email */}
              <div>
                <label htmlFor={`${uid}-email`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.email')} <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-email`} name="email" type="email" value={form.email}
                  onChange={handleChange} placeholder={t('fields.emailPlaceholder')}
                  className={inputCls(!!errors.email)} />
                {errors.email && <FieldError message={errors.email} />}
              </div>

              {/* Business Name */}
              <div>
                <label htmlFor={`${uid}-businessName`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.businessName')} <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-businessName`} name="businessName" type="text" value={form.businessName}
                  onChange={handleChange} placeholder={t('fields.businessNamePlaceholder')}
                  className={inputCls(!!errors.businessName)} />
                {errors.businessName && <FieldError message={errors.businessName} />}
              </div>

              {/* Business Type */}
              <div>
                <label htmlFor={`${uid}-businessType`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.businessType')} <span className="text-red-500">*</span>
                </label>
                <select id={`${uid}-businessType`} name="businessType" value={form.businessType}
                  onChange={handleChange} className={inputCls(!!errors.businessType)}>
                  <option value="">{t('fields.businessTypePlaceholder')}</option>
                  {BUSINESS_TYPES.map(type => <option key={type} value={type}>{t(`businessTypes.${type}`)}</option>)}
                </select>
                {errors.businessType && <FieldError message={errors.businessType} />}
              </div>

              {/* Retailer-only fields */}
              {form.businessType === 'Retailer' && (
                <div className="space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div>
                    <label htmlFor={`${uid}-storeNames`} className="block text-sm font-semibold text-text-dark mb-1.5">
                      {t('fields.storeNames')} <span className="text-red-500">*</span>
                    </label>
                    <input id={`${uid}-storeNames`} name="storeNames" type="text" value={form.storeNames}
                      onChange={handleChange} placeholder={t('fields.storeNamesPlaceholder')}
                      className={inputCls(!!errors.storeNames)} />
                    {errors.storeNames && <FieldError message={errors.storeNames} />}
                  </div>
                  <div>
                    <label htmlFor={`${uid}-storeCount`} className="block text-sm font-semibold text-text-dark mb-1.5">
                      {t('fields.storeCount')}
                    </label>
                    <input id={`${uid}-storeCount`} name="storeCount" type="number" min="1"
                      value={form.storeCount} onChange={handleChange} placeholder={t('fields.storeCountPlaceholder')}
                      className={inputCls()} />
                  </div>
                </div>
              )}

              {/* E-Commerce-only fields */}
              {form.businessType === 'E-Commerce' && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <label htmlFor={`${uid}-websiteUrl`} className="block text-sm font-semibold text-text-dark mb-1.5">
                    {t('fields.websiteUrl')} <span className="text-red-500">*</span>
                  </label>
                  <input id={`${uid}-websiteUrl`} name="websiteUrl" type="url" value={form.websiteUrl}
                    onChange={handleChange} placeholder={t('fields.websiteUrlPlaceholder')}
                    className={inputCls(!!errors.websiteUrl)} />
                  {errors.websiteUrl && <FieldError message={errors.websiteUrl} />}
                </div>
              )}

              {/* Contact Name */}
              <div>
                <label htmlFor={`${uid}-contactName`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.contactName')} <span className="text-red-500">*</span>
                </label>
                <input id={`${uid}-contactName`} name="contactName" type="text" value={form.contactName}
                  onChange={handleChange} placeholder={t('fields.contactNamePlaceholder')}
                  className={inputCls(!!errors.contactName)} />
                {errors.contactName && <FieldError message={errors.contactName} />}
              </div>

              {/* Contact Phone + Extension */}
              <div>
                <label htmlFor={`${uid}-contactPhone`} className="block text-sm font-semibold text-text-dark mb-1.5">
                  {t('fields.contactPhone')}
                </label>
                <input id={`${uid}-contactPhone`} name="contactPhone" type="tel" value={form.contactPhone}
                  onChange={handleChange} placeholder={t('fields.contactPhonePlaceholder')}
                  className={inputCls()} />
              </div>

              {/* GDPR consent */}
              <div className="pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" name="gdprConsent" checked={form.gdprConsent}
                    onChange={handleChange} className="mt-0.5 w-4 h-4 accent-sliquid-blue flex-shrink-0" />
                  <span className="text-xs text-text-gray leading-relaxed">
                    {t('fields.consent')} <span className="text-red-500">*</span>
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
                {submitting ? t('submitting') : t('submit')}
              </button>

            </form>
          </div>
        )}

        <p className="text-center text-xs text-text-light-gray mt-6">
          {t('copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  )
}
