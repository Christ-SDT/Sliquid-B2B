import { useState } from 'react'
import emailjs from '@emailjs/browser'
import type { ContactFormData, ContactFormErrors } from '@/types'
import { sanitizeFormData } from '@/utils/sanitize'
import {
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
  EMAILJS_CONTACT_ADMIN_TID,
  EMAILJS_CONTACT_REPLY_TID,
} from '@/utils/constants'

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

const PARTNERSHIP_TYPES = [
  {
    id: 'retailer',
    title: 'Retailer',
    description:
      'Open a wholesale account to carry Sliquid, RIDE Lube, and Ride Rocco in-store or online. Access merchandising assets, planogram support, and competitive wholesale pricing tiers.',
  },
  {
    id: 'media',
    title: 'Marketing & Media',
    description:
      'Press inquiries, brand collaborations, influencer partnerships, and editorial requests. Reach out with your media kit or proposal and our marketing team will follow up.',
  },
  {
    id: 'distributor',
    title: 'Distributor',
    description:
      'We work with regional and global distribution partners to expand access in markets where direct fulfillment is not available. Tell us about your territory and logistics capabilities.',
  },
]

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
      if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID) {
        const sends: Promise<unknown>[] = []
        if (EMAILJS_CONTACT_ADMIN_TID) {
          sends.push(
            emailjs.send(
              EMAILJS_SERVICE_ID,
              EMAILJS_CONTACT_ADMIN_TID,
              {
                from_name: sanitized.name,
                from_email: sanitized.email,
                company: sanitized.company,
                phone: sanitized.phone ?? '',
                subject: sanitized.subject,
                message: sanitized.message,
              },
              { publicKey: EMAILJS_PUBLIC_KEY },
            ),
          )
        }
        if (EMAILJS_CONTACT_REPLY_TID) {
          sends.push(
            emailjs.send(
              EMAILJS_SERVICE_ID,
              EMAILJS_CONTACT_REPLY_TID,
              { to_name: sanitized.name, reply_to: sanitized.email },
              { publicKey: EMAILJS_PUBLIC_KEY },
            ),
          )
        }
        await Promise.all(sends)
      }
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
            Let's build something together
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-xl leading-relaxed">
            Whether you are opening a wholesale account, exploring distribution,
            or looking for clinical-grade recommendations — our B2B team is
            ready to help.
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
                Who we work with
              </h2>
              <div className="space-y-6">
                {PARTNERSHIP_TYPES.map((type) => (
                  <div
                    key={type.id}
                    className="border border-gray-100 rounded-card p-7 bg-white hover:border-sliquid-blue
                               transition-colors duration-150"
                  >
                    <h3 className="text-text-dark text-lg font-semibold mb-2">
                      {type.title}
                    </h3>
                    <p className="text-text-gray text-sm leading-relaxed">
                      {type.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* What to expect */}
            <div>
              <h2 className="text-text-dark text-[26px] font-semibold mb-6">
                What happens next
              </h2>
              <ol className="space-y-5">
                {[
                  {
                    step: '01',
                    title: 'We review your inquiry',
                    detail:
                      'Our B2B team reads every message. We will match your inquiry to the right person — sales, distribution, or clinical partnerships.',
                  },
                  {
                    step: '02',
                    title: 'You hear back within 2 business days',
                    detail:
                      'We will reach out by email (or phone if you provided a number) to discuss your needs and next steps.',
                  },
                  {
                    step: '03',
                    title: 'We send a tailored proposal',
                    detail:
                      'Depending on your inquiry type, you will receive a wholesale pricing sheet, distributor agreement, or clinical partner overview.',
                  },
                  {
                    step: '04',
                    title: 'Onboarding & support',
                    detail:
                      'Once a partnership is confirmed, your dedicated account contact provides product training, asset kits, and ongoing support.',
                  },
                ].map((item) => (
                  <li key={item.step} className="flex gap-5 items-start">
                    <span
                      className="flex-shrink-0 w-10 h-10 rounded-full bg-bg-light-blue text-sliquid-blue
                                  font-bold text-sm flex items-center justify-center"
                    >
                      {item.step}
                    </span>
                    <div>
                      <p className="text-text-dark font-semibold text-base">
                        {item.title}
                      </p>
                      <p className="text-text-gray text-sm leading-relaxed mt-1">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Response info */}
            <div className="bg-bg-off-white rounded-card p-7 space-y-4">
              <h3 className="text-text-dark font-semibold text-base">
                Contact information
              </h3>
              <div className="space-y-3 text-sm text-text-gray">
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Dallas, TX — Headquarters</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Monday – Friday, 9am – 5pm CT</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-sliquid-blue mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Response within 2 business days</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="bg-white border border-gray-100 rounded-card p-8 shadow-sm sticky top-24">
            <h2 className="text-text-dark text-xl font-semibold mb-6">
              Send us a message
            </h2>
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

                {/* Phone */}
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
                  <option value="media">Marketing & Media</option>
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
                {submitting ? 'Sending…' : 'Send Message'}
              </button>

              <p className="text-text-light-gray text-xs text-center">
                We respond to all B2B inquiries within 2 business days.
              </p>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
