import { useState, useId } from 'react'
import emailjs from '@emailjs/browser'
import { sanitizeFormData } from '@/utils/sanitize'
import { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_RETAILER_ADMIN_TID, EMAILJS_RETAILER_CONFIRM_TID } from '@/utils/constants'

// ─── Static data ──────────────────────────────────────────────────────────────

const BRANDS = ['Sliquid Naturals', 'Sliquid Organics', 'The Balance Collection', 'Ride Lube']

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Japan',
  'Mexico',
  'Brazil',
  'Other',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetailerFormData {
  company: string
  firstName: string
  lastName: string
  streetAddress: string
  addressLine2: string
  city: string
  state: string
  zip: string
  country: string
  phone: string
  email: string
  website: string
  brands: string[]
  comments: string
  agreedToMap: boolean
}

interface RetailerFormErrors {
  company?: string
  firstName?: string
  lastName?: string
  streetAddress?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  email?: string
  brands?: string
  agreedToMap?: string
}

const EMPTY: RetailerFormData = {
  company: '',
  firstName: '',
  lastName: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  country: 'United States',
  phone: '',
  email: '',
  website: 'https://',
  brands: [],
  comments: '',
  agreedToMap: false,
}

function validate(d: RetailerFormData): RetailerFormErrors {
  const err: RetailerFormErrors = {}
  if (!d.company.trim()) err.company = 'Company is required.'
  if (!d.firstName.trim()) err.firstName = 'First name is required.'
  if (!d.lastName.trim()) err.lastName = 'Last name is required.'
  if (!d.streetAddress.trim()) err.streetAddress = 'Street address is required.'
  if (!d.city.trim()) err.city = 'City is required.'
  if (!d.state.trim()) err.state = 'State / Province is required.'
  if (!d.zip.trim()) err.zip = 'Postal / Zip code is required.'
  if (!d.phone.trim()) err.phone = 'Phone number is required.'
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = 'A valid email address is required.'
  if (d.brands.length === 0) err.brands = 'Please select at least one brand.'
  if (!d.agreedToMap) err.agreedToMap = 'You must agree to the Sliquid MAP Policy.'
  return err
}

// ─── Helper components ────────────────────────────────────────────────────────

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-1 text-red-600 text-xs">
      {message}
    </p>
  )
}

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-text-dark mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

const inputCls = (hasError?: boolean) =>
  `w-full rounded-lg border px-3.5 py-2.5 text-sm text-text-dark placeholder:text-text-light-gray bg-white
   focus:outline-none focus:ring-2 focus:ring-sliquid-blue/30 transition
   ${hasError ? 'border-red-400' : 'border-gray-200 focus:border-sliquid-blue'}`

// ─── Thank You Modal ──────────────────────────────────────────────────────────

function ThankYouModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="retailer-thankyou-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="retailer-thankyou-title" className="text-text-dark text-2xl font-bold mb-3">
          Thank You for Applying!
        </h2>
        <p className="text-text-gray text-sm leading-relaxed mb-2">
          We've received your application to become a Sliquid retailer or distributor. A member of our sales team will review your submission and contact you shortly.
        </p>
        <p className="text-text-gray text-sm leading-relaxed mb-7">
          If you have any immediate questions, feel free to reach us at{' '}
          <a href="mailto:sales@sliquid.com" className="text-sliquid-blue hover:underline">
            sales@sliquid.com
          </a>
          .
        </p>
        <button
          onClick={onClose}
          className="bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-8 rounded-lg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BecomeARetailerPage() {
  const uid = useId()
  const [form, setForm] = useState<RetailerFormData>(EMPTY)
  const [errors, setErrors] = useState<RetailerFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sendError, setSendError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    if (type === 'checkbox' && name === 'brands') {
      const checked = (e.target as HTMLInputElement).checked
      setForm(prev => ({
        ...prev,
        brands: checked ? [...prev.brands, value] : prev.brands.filter(b => b !== value),
      }))
      setErrors(prev => ({ ...prev, brands: undefined }))
    } else if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setForm(prev => ({ ...prev, [name]: checked }))
      setErrors(prev => ({ ...prev, [name]: undefined }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
      setErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_RETAILER_ADMIN_TID || !EMAILJS_RETAILER_CONFIRM_TID) {
      setSendError('Email service is not configured. Please contact us directly at sales@sliquid.com.')
      return
    }
    setSubmitting(true)
    setSendError('')
    try {
      const safe = sanitizeFormData(form)
      const websiteVal = safe.website === 'https://' ? '' : safe.website
      const payload = {
        company:      safe.company,
        contact_name: `${safe.firstName} ${safe.lastName}`,
        address:      [safe.streetAddress, safe.addressLine2, safe.city, safe.state, safe.zip, safe.country].filter(Boolean).join(', '),
        phone:        safe.phone,
        email:        safe.email,
        website:      websiteVal || 'N/A',
        brands:       safe.brands.join(', ') || 'None selected',
        comments:     safe.comments || 'N/A',
      }
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_RETAILER_ADMIN_TID, payload, { publicKey: EMAILJS_PUBLIC_KEY })
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_RETAILER_CONFIRM_TID, { ...payload, to_email: safe.email }, { publicKey: EMAILJS_PUBLIC_KEY })
      setSubmitted(true)
    } catch {
      setSendError('Something went wrong sending your application. Please try again or email sales@sliquid.com directly.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {submitted && <ThankYouModal onClose={() => { setSubmitted(false); setForm(EMPTY) }} />}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-3">
            Partner With Sliquid
          </p>
          <h1 className="text-text-dark text-[34px] md:text-[46px] font-bold tracking-tight leading-tight mb-5">
            Do you want to become a Sliquid Retailer or Distributor?
          </h1>
          <p className="text-text-gray text-base md:text-lg leading-relaxed">
            Complete the form below and a member of the Sliquid sales team will contact you shortly.
          </p>
        </div>
      </section>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <section className="py-14 md:py-24" aria-labelledby="retailer-form-heading">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <h2 id="retailer-form-heading" className="text-text-dark text-[22px] font-bold tracking-tight pb-4 border-b border-gray-200">
              Become a Retailer or Distributor
            </h2>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {sendError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
                {sendError}
              </div>
            )}

            {/* Company */}
            <div>
              <Label htmlFor={`${uid}-company`} required>Company</Label>
              <input
                id={`${uid}-company`}
                name="company"
                type="text"
                value={form.company}
                onChange={handleChange}
                aria-describedby={errors.company ? `${uid}-companyErr` : undefined}
                className={inputCls(!!errors.company)}
              />
              {errors.company && <FieldError id={`${uid}-companyErr`} message={errors.company} />}
            </div>

            {/* Name */}
            <div>
              <Label htmlFor={`${uid}-fname`} required>Name</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    id={`${uid}-fname`}
                    name="firstName"
                    type="text"
                    placeholder="First"
                    value={form.firstName}
                    onChange={handleChange}
                    aria-describedby={errors.firstName ? `${uid}-fnameErr` : undefined}
                    className={inputCls(!!errors.firstName)}
                  />
                  <p className="mt-1 text-xs text-text-light-gray">First</p>
                  {errors.firstName && <FieldError id={`${uid}-fnameErr`} message={errors.firstName} />}
                </div>
                <div>
                  <input
                    id={`${uid}-lname`}
                    name="lastName"
                    type="text"
                    placeholder="Last"
                    value={form.lastName}
                    onChange={handleChange}
                    aria-describedby={errors.lastName ? `${uid}-lnameErr` : undefined}
                    className={inputCls(!!errors.lastName)}
                  />
                  <p className="mt-1 text-xs text-text-light-gray">Last</p>
                  {errors.lastName && <FieldError id={`${uid}-lnameErr`} message={errors.lastName} />}
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-dark">Address</p>
              <div>
                <input
                  id={`${uid}-street`}
                  name="streetAddress"
                  type="text"
                  placeholder=""
                  value={form.streetAddress}
                  onChange={handleChange}
                  aria-describedby={errors.streetAddress ? `${uid}-streetErr` : undefined}
                  className={inputCls(!!errors.streetAddress)}
                />
                <p className="mt-1 text-xs text-text-light-gray">Street Address</p>
                {errors.streetAddress && <FieldError id={`${uid}-streetErr`} message={errors.streetAddress} />}
              </div>
              <div>
                <input
                  name="addressLine2"
                  type="text"
                  placeholder=""
                  value={form.addressLine2}
                  onChange={handleChange}
                  className={inputCls()}
                />
                <p className="mt-1 text-xs text-text-light-gray">Address Line 2</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    id={`${uid}-city`}
                    name="city"
                    type="text"
                    value={form.city}
                    onChange={handleChange}
                    aria-describedby={errors.city ? `${uid}-cityErr` : undefined}
                    className={inputCls(!!errors.city)}
                  />
                  <p className="mt-1 text-xs text-text-light-gray">City</p>
                  {errors.city && <FieldError id={`${uid}-cityErr`} message={errors.city} />}
                </div>
                <div>
                  <input
                    id={`${uid}-state`}
                    name="state"
                    type="text"
                    value={form.state}
                    onChange={handleChange}
                    aria-describedby={errors.state ? `${uid}-stateErr` : undefined}
                    className={inputCls(!!errors.state)}
                  />
                  <p className="mt-1 text-xs text-text-light-gray">State / Province / Region</p>
                  {errors.state && <FieldError id={`${uid}-stateErr`} message={errors.state} />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    id={`${uid}-zip`}
                    name="zip"
                    type="text"
                    value={form.zip}
                    onChange={handleChange}
                    aria-describedby={errors.zip ? `${uid}-zipErr` : undefined}
                    className={inputCls(!!errors.zip)}
                  />
                  <p className="mt-1 text-xs text-text-light-gray">Postal / Zip Code</p>
                  {errors.zip && <FieldError id={`${uid}-zipErr`} message={errors.zip} />}
                </div>
                <div>
                  <select
                    id={`${uid}-country`}
                    name="country"
                    value={form.country}
                    onChange={handleChange}
                    className={inputCls()}
                  >
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-light-gray">Country</p>
                </div>
              </div>
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor={`${uid}-phone`} required>Phone Number</Label>
              <input
                id={`${uid}-phone`}
                name="phone"
                type="tel"
                placeholder="(555) 555-5555"
                value={form.phone}
                onChange={handleChange}
                aria-describedby={errors.phone ? `${uid}-phoneErr` : undefined}
                className={inputCls(!!errors.phone)}
              />
              {errors.phone && <FieldError id={`${uid}-phoneErr`} message={errors.phone} />}
            </div>

            {/* Email */}
            <div>
              <Label htmlFor={`${uid}-email`} required>Email</Label>
              <input
                id={`${uid}-email`}
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                aria-describedby={errors.email ? `${uid}-emailErr` : undefined}
                className={inputCls(!!errors.email)}
              />
              {errors.email && <FieldError id={`${uid}-emailErr`} message={errors.email} />}
            </div>

            {/* Website */}
            <div>
              <Label htmlFor={`${uid}-website`}>Website</Label>
              <input
                id={`${uid}-website`}
                name="website"
                type="url"
                placeholder="https://"
                value={form.website}
                onChange={handleChange}
                className={inputCls()}
              />
            </div>

            {/* Brands */}
            <div>
              <p className="text-sm font-semibold text-text-dark mb-2">
                Brands You Are Interested In <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                {BRANDS.map(brand => (
                  <label key={brand} className="flex items-center gap-2.5 cursor-pointer text-sm text-text-gray hover:text-text-dark">
                    <input
                      type="checkbox"
                      name="brands"
                      value={brand}
                      checked={form.brands.includes(brand)}
                      onChange={handleChange}
                      className="accent-sliquid-blue"
                    />
                    {brand}
                  </label>
                ))}
              </div>
              {errors.brands && <FieldError id={`${uid}-brandsErr`} message={errors.brands} />}
            </div>

            {/* Comments */}
            <div>
              <Label htmlFor={`${uid}-comments`}>Questions / Comments?</Label>
              <textarea
                id={`${uid}-comments`}
                name="comments"
                rows={5}
                value={form.comments}
                onChange={handleChange}
                className={`${inputCls()} resize-y`}
              />
            </div>

            {/* MAP Policy */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text-dark">
                You must review the policy <span className="text-red-500">*</span>
              </p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="agreedToMap"
                  checked={form.agreedToMap}
                  onChange={handleChange}
                  className="mt-0.5 accent-sliquid-blue"
                />
                <span className="text-sm text-text-gray leading-relaxed">
                  I agree to the Sliquid MAP Policy below
                </span>
              </label>
              {errors.agreedToMap && <FieldError id={`${uid}-mapErr`} message={errors.agreedToMap} />}
              <a
                href="/map-policy"
                className="inline-block text-sm text-sliquid-blue hover:underline"
              >
                Sliquid Minimum Advertised Price Policy
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60 text-white font-semibold text-sm py-3 px-10 rounded-lg transition-colors flex items-center gap-2"
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
      </section>
    </>
  )
}
