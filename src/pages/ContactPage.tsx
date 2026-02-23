import { useState } from 'react'
import type { ContactFormData, ContactFormErrors } from '@/types'
import { sanitizeFormData } from '@/utils/sanitize'

function validate(data: ContactFormData): ContactFormErrors {
  const errors: ContactFormErrors = {}
  if (!data.name.trim()) errors.name = 'Full name is required.'
  if (!data.company.trim()) errors.company = 'Company name is required.'
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(data.email)) errors.email = 'A valid email address is required.'
  if (!data.subject.trim()) errors.subject = 'Please select an inquiry type.'
  if (data.message.trim().length < 20)
    errors.message = 'Message must be at least 20 characters.'
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

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-1 text-red-600 text-xs">
      {message}
    </p>
  )
}

export default function ContactPage() {
  const [form, setForm] = useState<ContactFormData>(EMPTY)
  const [errors, setErrors] = useState<ContactFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const inputCls = (field: keyof ContactFormData) =>
    `w-full px-4 py-2.5 border rounded-lg text-sm text-text-dark
     focus:outline-none focus:ring-2 focus:ring-sliquid-blue focus:border-transparent
     ${errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-bg-off-white'}`

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
    const fieldErrors = validate(sanitized)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setSubmitting(true)
    try {
      /*
       * Server MUST enforce per-IP rate limiting (e.g. 5 req/hour)
       * and CSRF protection before processing form data.
       * Replace the delay below with: await fetch('/api/contact', { method: 'POST', body: JSON.stringify(sanitized) })
       */
      await new Promise((resolve) => setTimeout(resolve, 800))
      setSubmitted(true)
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
          <h2 className="text-text-dark text-2xl font-bold">Message Sent</h2>
          <p className="text-text-gray">
            Our B2B team will respond within 2 business days.
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
            Get in Touch
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight">
            Contact Us
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-xl leading-relaxed">
            Inquire about wholesale accounts, distribution partnerships, or
            healthcare practitioner access.
          </p>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text-dark mb-1.5">
                  Full Name <span className="text-red-500" aria-hidden="true">*</span>
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
                  Company <span className="text-red-500" aria-hidden="true">*</span>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-dark mb-1.5">
                  Email <span className="text-red-500" aria-hidden="true">*</span>
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

              {/* Phone (optional) */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-text-dark mb-1.5">
                  Phone{' '}
                  <span className="text-text-light-gray font-normal text-xs">(optional)</span>
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
                Inquiry Type <span className="text-red-500" aria-hidden="true">*</span>
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
                <option value="">Select inquiry type…</option>
                <option value="retailer">Retailer Account</option>
                <option value="practitioner">Health Practitioner</option>
                <option value="distributor">Distribution Partnership</option>
                <option value="general">General Inquiry</option>
              </select>
              {errors.subject && <FieldError id="subject-error" message={errors.subject} />}
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-text-dark mb-1.5">
                Message <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <textarea
                id="message"
                name="message"
                value={form.message}
                onChange={handleChange}
                rows={6}
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
              {submitting ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
