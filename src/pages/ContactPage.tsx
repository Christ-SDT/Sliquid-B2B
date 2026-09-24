import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ContactFormData, ContactFormErrors } from '@/types'
import { sanitizeFormData } from '@/utils/sanitize'
import FormCooldownNotice, { useFormCooldown } from '@/components/FormCooldownNotice'
import i18n from '@/i18n'
import { serverErrorText } from '@/utils/serverError'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sliquid-b2b-production.up.railway.app'

function validate(data: ContactFormData, t: TFunction<'contact'>): ContactFormErrors {
  const errors: ContactFormErrors = {}
  if (!data.name.trim()) errors.name = t('errors.nameRequired')
  if (!data.company.trim()) errors.company = t('errors.companyRequired')
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(data.email)) errors.email = t('errors.emailInvalid')
  if (!data.subject.trim()) errors.subject = t('errors.subjectRequired')
  if (data.message.trim().length < 20)
    errors.message = t('errors.messageTooShort')
  return errors
}

const EMPTY: ContactFormData = {
  name: '',
  company: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
}

// Copy lives in the `contact` namespace under partnerships.<id>.
const PARTNERSHIP_TYPES = ['retailer', 'media', 'distributor', 'medical'] as const

// Copy under steps.<id>; the number is presentational.
const STEPS = [
  { step: '01', id: 'review' },
  { step: '02', id: 'reply' },
  { step: '03', id: 'proposal' },
  { step: '04', id: 'onboarding' },
] as const

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-1 text-red-600 text-xs">
      {message}
    </p>
  )
}

export default function ContactPage() {
  const { t } = useTranslation('contact')
  const [form, setForm] = useState<ContactFormData>(EMPTY)
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sendError, setSendError] = useState('')
  const cooldown = useFormCooldown('contact')

  const inputCls = (field: keyof ContactFormData) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm text-text-dark
     focus:outline-none focus:ring-2 focus:ring-sliquid-blue focus:border-transparent
     ${errors[field] ? 'border-red-500 bg-red-50' : 'border-gray-500 bg-bg-off-white'}`

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof ContactFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const sanitized = sanitizeFormData(form)
    const fieldErrors = validate(sanitized, t)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setSubmitting(true)
    setSendError('')
    try {
      const res = await fetch(`${API_BASE}/api/b2b/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName:  sanitized.name,
          fromEmail: sanitized.email,
          company:   sanitized.company,
          phone:     sanitized.phone ?? '',
          subject:   sanitized.subject,
          message:   sanitized.message,
          language:  i18n.resolvedLanguage ?? 'en',
        }),
      })
      const data = await res.json().catch(() => ({})) as { message?: string; code?: string; params?: Record<string, unknown>; retryAfterMinutes?: number }
      if (res.status === 429) {
        // A duplicate inside the hour still means their first message landed,
        // so the success screen is honest here — just start the clock so the
        // form is locked rather than re-offered.
        cooldown.lock(data.retryAfterMinutes ?? 60)
        setSubmitted(true)
        return
      }
      // A spam-block refusal carries its own text (with a human contact route);
      // anything else falls through to the generic send failure below.
      if (res.status === 403) {
        setSendError(serverErrorText(data, t('errors.sendFailed')))
        return
      }
      if (!res.ok) throw new Error(data.message ?? 'Request failed')
      cooldown.start()
      setSubmitted(true)
    } catch {
      // Do NOT show success here. This branch used to call setSubmitted(true)
      // "because email failure is silent" — but it fires on a network error,
      // a CORS rejection or a 500, i.e. exactly when the message did NOT
      // arrive. It told the sender their message landed, and because the
      // submission never completed it also left the one-hour gate unarmed, so
      // the form was wide open when they came back. Both symptoms, one line.
      setSendError(t('errors.sendFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div
            className="w-16 h-16 bg-bg-light-blue rounded-full flex items-center
                        justify-center mx-auto"
          >
            <svg
              className="w-8 h-8 text-sliquid-blue"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-text-dark text-2xl font-bold">{t('success.title')}</h2>
          <p className="text-text-gray">
            {t('success.body')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('hero.eyebrow')}
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-xl leading-relaxed">
            {t('hero.body')}
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-16 items-start">

          {/* Left: info panel */}
          <div className="space-y-12">

            {/* Partnership types */}
            <div>
              <h2 className="text-text-dark text-[26px] font-semibold mb-8">
                {t('partnerships.heading')}
              </h2>
              <div className="space-y-6">
                {PARTNERSHIP_TYPES.map((id) => (
                  <div
                    key={id}
                    className="border border-gray-100 rounded-card p-7 bg-white hover:border-sliquid-blue
                               transition-colors duration-150"
                  >
                    <h3 className="text-text-dark text-lg font-semibold mb-2">
                      {t(`partnerships.${id}.title`)}
                    </h3>
                    <p className="text-text-gray text-sm leading-relaxed">
                      {t(`partnerships.${id}.description`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* What to expect */}
            <div>
              <h2 className="text-text-dark text-[26px] font-semibold mb-6">
                {t('steps.heading')}
              </h2>
              <ol className="space-y-5">
                {STEPS.map((item) => (
                  <li key={item.step} className="flex gap-5 items-start">
                    <span
                      className="flex-shrink-0 w-10 h-10 rounded-full bg-bg-light-blue text-sliquid-blue
                                  font-bold text-sm flex items-center justify-center"
                    >
                      {item.step}
                    </span>
                    <div>
                      <p className="text-text-dark font-semibold text-base">
                        {t(`steps.${item.id}.title`)}
                      </p>
                      <p className="text-text-gray text-sm leading-relaxed mt-1">
                        {t(`steps.${item.id}.detail`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Response info */}
            <div className="bg-bg-off-white rounded-card p-7 space-y-4">
              <h3 className="text-text-dark font-semibold text-base">
                {t('info.heading')}
              </h3>
              <div className="space-y-3 text-sm text-text-gray">
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{t('info.location')}</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{t('info.hours')}</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{t('info.response')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="bg-white border border-gray-100 rounded-card p-8 shadow-sm sticky top-24">
            <h2 className="text-text-dark text-xl font-semibold mb-6">
              {t('form.heading')}
            </h2>
            {cooldown.blocked ? (
              <FormCooldownNotice minutes={cooldown.minutesLeft} noun="message" />
            ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {sendError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {sendError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-text-dark mb-1.5">
                    {t('form.name')} <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    maxLength={100}
                    autoComplete="name"
                    aria-required="true"
                    aria-describedby={errors.name ? 'name-error' : undefined}
                    className={inputCls('name')}
                  />
                  {errors.name && <FieldError id="name-error" message={errors.name} />}
                </div>

                {/* Company */}
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-text-dark mb-1.5">
                    {t('form.company')} <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={form.company}
                    onChange={handleChange}
                    maxLength={100}
                    autoComplete="organization"
                    aria-required="true"
                    aria-describedby={errors.company ? 'company-error' : undefined}
                    className={inputCls('company')}
                  />
                  {errors.company && <FieldError id="company-error" message={errors.company} />}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-dark mb-1.5">
                    {t('form.email')} <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    maxLength={254}
                    autoComplete="email"
                    aria-required="true"
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    className={inputCls('email')}
                  />
                  {errors.email && <FieldError id="email-error" message={errors.email} />}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-text-dark mb-1.5">
                    {t('form.phone')}{' '}
                    <span className="text-text-light-gray font-normal text-xs">{t('form.optional')}</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={form.phone ?? ''}
                    onChange={handleChange}
                    maxLength={20}
                    autoComplete="tel"
                    className={inputCls('phone')}
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-text-dark mb-1.5">
                  {t('form.inquiryType')} <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  aria-required="true"
                  aria-describedby={errors.subject ? 'subject-error' : undefined}
                  className={inputCls('subject')}
                >
                  <option value="">{t('form.options.placeholder')}</option>
                  <option value="retailer">{t('form.options.retailer')}</option>
                  <option value="media">{t('form.options.media')}</option>
                  <option value="distributor">{t('form.options.distributor')}</option>
                  <option value="medical">{t('form.options.medical')}</option>
                  <option value="general">{t('form.options.general')}</option>
                </select>
                {errors.subject && <FieldError id="subject-error" message={errors.subject} />}
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-text-dark mb-1.5">
                  {t('form.message')} <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  rows={5}
                  maxLength={2000}
                  aria-required="true"
                  aria-describedby={errors.message ? 'message-error' : undefined}
                  className={inputCls('message')}
                />
                {errors.message && <FieldError id="message-error" message={errors.message} />}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-50
                           text-white font-semibold py-3.5 rounded-lg text-sm transition-colors duration-150
                           focus:outline-none focus:ring-2 focus:ring-sliquid-blue focus:ring-offset-2"
              >
                {submitting ? t('form.submitting') : t('form.submit')}
              </button>

              <p className="text-text-light-gray text-xs text-center">
                {t('form.footnote')}
              </p>
            </form>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
