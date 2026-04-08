import { useState, useId } from 'react'
import emailjs from '@emailjs/browser'
import { sanitizeFormData } from '@/utils/sanitize'
import { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_HP_TID } from '@/utils/constants'

// ─── Static data ──────────────────────────────────────────────────────────────

const HP_IMAGE =
  'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/ai-images/1/87ed7738-8b0b-425e-a09c-cb563cdd99c0.jpg'

const KEY_INGREDIENTS = [
  {
    id: 'purified-water',
    name: 'Purified Water',
    tag: 'Base',
    description:
      'The foundation of every water-based formula. Triple-filtered and deionized, it serves as a pure, contaminant-free carrier for all water-soluble ingredients.',
  },
  {
    id: 'aloe-vera',
    name: 'Organic Aloe Barbadensis Leaf Juice',
    tag: 'Soothing Base',
    description:
      'Sourced directly from aloe vera leaves, this naturally lubricating and healing ingredient is anti-inflammatory and pH-friendly for sensitive mucosal tissue.',
  },
  {
    id: 'vitamin-e',
    name: 'Natural Tocopherols (Vitamin E)',
    tag: 'Antioxidant',
    description:
      'Conditions skin and delivers antioxidant support. Extends shelf life naturally while protecting sensitive tissue without the need for synthetic preservatives.',
  },
  {
    id: 'citric-acid',
    name: 'Citric Acid',
    tag: 'pH Balancer',
    description:
      'Calibrates each formula to match the body\'s natural pH range of 3.8 to 4.5. Acts as a natural antiseptic and pH buffer, critical for supporting vaginal microbiome health.',
  },
  {
    id: 'potassium-sorbate',
    name: 'Potassium Sorbate & Sodium Benzoate',
    tag: 'Preservative',
    description:
      'Two of the gentlest non-toxic preservatives available. They extend shelf life and prevent contamination without the hormonal disruption risks associated with parabens.',
  },
  {
    id: 'plant-cellulose',
    name: 'Plant Cellulose',
    tag: 'Natural Thickener',
    description:
      'Derived from cotton and completely vegan and gluten-free. Delivers the signature silky glide Sliquid is known for, without synthetic polymers or petrochemical derivatives.',
  },
]

const REQUIREMENTS = [
  'Must be a verifiable medical professional or college educator / organization facilitator with a current position at an established operation. This includes student representatives of college organizations acting on behalf of a school.',
  'Must provide a verifiable mailing address specifically associated with the medical facility or college campus listed on the form. Residential and P.O. Box addresses will not be accepted. No exceptions.',
  'Requests outside the United States are required to cover shipping and duty costs associated with the complimentary sample shipment.',
  'Only one request per practice or organization. Duplicate submissions will be disqualified.',
]

const HOW_IT_WORKS =
  'Your clinic or organization MUST meet all listed requirements. Upon positive verification of the information you provide, your practice/organization will be approved for a one-time, complimentary shipment of 100 single-use samples and marketing materials offering your clients a discount code for use on our site. A review may take up to 6 weeks. ONLY SUBMIT ONE REQUEST and wait to be contacted by our staff. You will be contacted whether you are approved or denied.'

const HOW_IT_WORKS_2 =
  'Shipping is complimentary within the United States but must be paid in advance by all international partners. The formulas chosen to be sent are dictated by Sliquid and are subject to change at any time.'

const HOW_IT_WORKS_3 =
  'Please note that ONLY your initial shipment of 100 samples is free. Additional samples are available at a special Medical Partners discount rate. Please ask your Sliquid representative for the pricing structure and order form.'

const PRACTICE_TYPES = [
  'OB/GYN',
  'Pelvic Floor Therapy',
  'Sexual Health & Wellness',
  'General Practitioner',
  'Other (specify below)',
]

// ─── Form types ───────────────────────────────────────────────────────────────

interface HPFormData {
  practiceType: string
  practiceTypeOther: string
  practiceName: string
  streetAddress: string
  addressLine2: string
  city: string
  state: string
  zip: string
  country: string
  practicePhone: string
  practiceWebsite: string
  firstName: string
  lastName: string
  relationship: string
  contactPhone: string
  email: string
  preferredContact: string
  addToDirectory: string
  optInEmail: boolean
}

interface HPFormErrors {
  practiceType?: string
  practiceName?: string
  streetAddress?: string
  city?: string
  state?: string
  zip?: string
  practicePhone?: string
  firstName?: string
  lastName?: string
  contactPhone?: string
  email?: string
  optInEmail?: string
}

const EMPTY: HPFormData = {
  practiceType: '',
  practiceTypeOther: '',
  practiceName: '',
  streetAddress: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  country: 'United States',
  practicePhone: '',
  practiceWebsite: '',
  firstName: '',
  lastName: '',
  relationship: '',
  contactPhone: '',
  email: '',
  preferredContact: 'Email',
  addToDirectory: 'Yes',
  optInEmail: false,
}

function validate(d: HPFormData): HPFormErrors {
  const err: HPFormErrors = {}
  if (!d.practiceType) err.practiceType = 'Please select a practice type.'
  if (!d.practiceName.trim()) err.practiceName = 'Practice name is required.'
  if (!d.streetAddress.trim()) err.streetAddress = 'Street address is required.'
  if (!d.city.trim()) err.city = 'City is required.'
  if (!d.state.trim()) err.state = 'State / Province is required.'
  if (!d.zip.trim()) err.zip = 'Postal / Zip code is required.'
  if (!d.practicePhone.trim()) err.practicePhone = 'Practice phone is required.'
  if (!d.firstName.trim()) err.firstName = 'First name is required.'
  if (!d.lastName.trim()) err.lastName = 'Last name is required.'
  if (!d.contactPhone.trim()) err.contactPhone = 'Phone number is required.'
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = 'A valid email address is required.'
  if (!d.optInEmail) err.optInEmail = 'You must agree to receive Medical Partners Program emails.'
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

// ─── Requirements Gate Modal ──────────────────────────────────────────────────

function RequirementsGate({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="req-gate-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
        <h2 id="req-gate-title" className="text-text-dark text-xl font-bold mb-2">
          Before You Apply
        </h2>
        <p className="text-text-gray text-sm mb-5 leading-relaxed">
          Please confirm that your practice meets all of the following requirements. Submissions that do not meet these criteria will not be processed.
        </p>
        <ul className="space-y-3 mb-7">
          {REQUIREMENTS.map((req, i) => (
            <li key={i} className="flex gap-3 text-sm text-text-gray leading-relaxed">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-sliquid-blue/10 text-sliquid-blue flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              {req}
            </li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onAccept}
            className="flex-1 bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-6 rounded-lg transition-colors"
          >
            I Meet All Requirements — Continue
          </button>
          <button
            onClick={onDecline}
            className="flex-1 border border-gray-200 text-text-gray hover:text-text-dark hover:border-gray-300 font-medium text-sm py-3 px-6 rounded-lg transition-colors"
          >
            I Do Not Qualify
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Thank You Modal ──────────────────────────────────────────────────────────

function ThankYouModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thankyou-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="thankyou-title" className="text-text-dark text-2xl font-bold mb-3">
          Thank You for Signing Up!
        </h2>
        <p className="text-text-gray text-sm leading-relaxed mb-2">
          We've received your application for the Sliquid Medical Partners Program. A member of our team will review your submission and reach out — please allow up to <strong>6 weeks</strong> for a response.
        </p>
        <p className="text-text-gray text-sm leading-relaxed mb-7">
          You will be contacted whether your application is approved or declined. Please do not submit more than one request.
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

export default function HealthPractitionersPage() {
  const uid = useId()
  const [activeTab, setActiveTab] = useState<'requirements' | 'how'>('requirements')
  const [gateState, setGateState] = useState<'hidden' | 'open' | 'accepted' | 'declined'>('hidden')
  const [form, setForm] = useState<HPFormData>(EMPTY)
  const [errors, setErrors] = useState<HPFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [sendError, setSendError] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  function openGate() {
    if (gateState === 'hidden') setGateState('open')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_HP_TID) {
      setSendError('Email service is not configured. Please contact us directly at erik@sliquid.com.')
      return
    }
    setSubmitting(true); setSendError('')
    try {
      const safe = sanitizeFormData(form)
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_HP_TID,
        {
          practice_type:       safe.practiceType + (safe.practiceTypeOther ? ` — ${safe.practiceTypeOther}` : ''),
          practice_name:       safe.practiceName,
          practice_address:    [safe.streetAddress, safe.addressLine2, safe.city, safe.state, safe.zip, safe.country].filter(Boolean).join(', '),
          practice_phone:      safe.practicePhone,
          practice_website:    safe.practiceWebsite || 'N/A',
          contact_name:        `${safe.firstName} ${safe.lastName}`,
          relationship:        safe.relationship || 'N/A',
          contact_phone:       safe.contactPhone,
          email:               safe.email,
          preferred_contact:   safe.preferredContact,
          add_to_directory:    safe.addToDirectory,
          to_email:            'erik@sliquid.com',
        },
        { publicKey: EMAILJS_PUBLIC_KEY },
      )
      setSubmitted(true)
    } catch {
      setSendError('Something went wrong sending your application. Please try again or email erik@sliquid.com directly.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Requirements gate modal */}
      {gateState === 'open' && (
        <RequirementsGate
          onAccept={() => setGateState('accepted')}
          onDecline={() => setGateState('declined')}
        />
      )}

      {/* Thank you modal */}
      {submitted && (
        <ThankYouModal onClose={() => setSubmitted(false)} />
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-3">
            Medical Partners Program
          </p>
          <h1 className="text-text-dark text-[34px] md:text-[46px] font-bold tracking-tight leading-tight mb-5">
            The Wellness Brand Healthcare Providers Trust
          </h1>
          <p className="text-text-gray text-base md:text-lg leading-relaxed mb-8">
            Sliquid equips healthcare providers with clinical-grade resources, complimentary patient samples, and educational materials to help you make confident recommendations and build lasting patient trust in intimate wellness.
          </p>
          <a
            href="#apply"
            className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-7 rounded-lg transition-colors"
          >
            Apply to the Program
          </a>
        </div>
      </section>

      {/* ── Key Ingredients ─────────────────────────────────────────────── */}
      <section className="py-14 md:py-20" aria-labelledby="ingredients-heading">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 id="ingredients-heading" className="text-text-dark text-[28px] md:text-[32px] font-bold tracking-tight mb-4">
              Ingredients You Can Trust
            </h2>
            <p className="text-text-gray text-base leading-relaxed">
              Every ingredient is chosen for clinical compatibility. No glycerin, no parabens, no artificial fragrance, just clean formulas safe enough to recommend to your most sensitive patients.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {KEY_INGREDIENTS.map(ing => (
              <div
                key={ing.id}
                className="bg-bg-off-white rounded-xl p-6 border border-gray-100"
              >
                <span className="inline-block bg-sliquid-blue/10 text-sliquid-blue text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3">
                  {ing.tag}
                </span>
                <h3 className="text-text-dark text-[15px] font-semibold mb-2">{ing.name}</h3>
                <p className="text-text-gray text-sm leading-relaxed">{ing.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-text-gray text-sm">
            Want the full ingredient breakdown?{' '}
            <a href="/ingredients" className="text-sliquid-blue hover:underline font-medium">
              View our complete formula standards →
            </a>
          </p>
        </div>
      </section>

      {/* ── Image break ─────────────────────────────────────────────────── */}
      <div className="w-full h-[420px] md:h-[500px] overflow-hidden">
        <img
          src={HP_IMAGE}
          alt="Sliquid intimate wellness products displayed for healthcare practitioners"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-full object-cover"
        />
      </div>

      {/* ── Requirements / How It Works tabs ────────────────────────────── */}
      <section className="py-14 md:py-20 bg-bg-off-white" aria-labelledby="program-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 id="program-heading" className="text-text-dark text-[28px] md:text-[32px] font-bold tracking-tight mb-6 text-center">
            Program Details
          </h2>

          {/* Tab switcher */}
          <div className="flex justify-center gap-2 mb-8">
            {(['requirements', 'how'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors
                  ${activeTab === tab
                    ? 'bg-sliquid-blue text-white'
                    : 'bg-white text-text-gray border border-gray-200 hover:border-sliquid-blue hover:text-sliquid-blue'
                  }`}
              >
                {tab === 'requirements' ? 'Requirements' : 'How It Works'}
              </button>
            ))}
          </div>

          {activeTab === 'requirements' && (
            <div className="space-y-4">
              {REQUIREMENTS.map((req, i) => (
                <div key={i} className="flex gap-4 bg-white rounded-xl p-5 border border-gray-100">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sliquid-blue/10 text-sliquid-blue flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-text-gray text-sm leading-relaxed">{req}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'how' && (
            <div className="space-y-4">
              {[HOW_IT_WORKS, HOW_IT_WORKS_2, HOW_IT_WORKS_3].map((block, i) => (
                <p key={i} className="text-text-gray text-sm leading-relaxed bg-white rounded-xl p-5 border border-gray-100">
                  {block}
                </p>
              ))}
              <p className="text-text-gray/70 text-xs italic pt-2">
                *The price of international shipping varies by location and is subject to the rate of the carrier at the time of shipping. This rate will be provided to international partners by a Sliquid representative.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Application Form ─────────────────────────────────────────────── */}
      <section id="apply" className="py-14 md:py-24" aria-labelledby="form-heading">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 id="form-heading" className="text-text-dark text-[28px] md:text-[32px] font-bold tracking-tight mb-3">
              Medical Partners Program Application
            </h2>
            <p className="text-text-gray text-base">
              Complete the form below to request complimentary samples and be listed in our Medical Partners directory.
            </p>
          </div>

          {/* Gate — show prompt if not yet accepted */}
          {gateState !== 'accepted' && gateState !== 'declined' && (
            <div
              className="bg-bg-off-white border border-gray-200 rounded-2xl p-8 text-center mb-8 cursor-pointer hover:border-sliquid-blue/40 transition-colors"
              onClick={openGate}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && openGate()}
              aria-label="Review requirements and begin application"
            >
              <div className="w-12 h-12 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-text-dark font-semibold text-lg mb-2">Review Requirements Before Applying</h3>
              <p className="text-text-gray text-sm max-w-md mx-auto mb-5">
                Before filling out the application, please confirm your practice meets all program requirements.
              </p>
              <span className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-7 rounded-lg transition-colors">
                View Requirements &amp; Begin Application
              </span>
            </div>
          )}

          {gateState === 'declined' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
              <p className="text-amber-800 text-sm font-medium">
                Thank you for checking the requirements. If your practice does not currently qualify, please{' '}
                <a href="/contact" className="underline hover:text-amber-900">contact us</a>{' '}
                with any questions.
              </p>
              <button
                onClick={() => setGateState('hidden')}
                className="mt-3 text-xs text-amber-700 underline hover:text-amber-900"
              >
                Review requirements again
              </button>
            </div>
          )}

          {/* The actual form — only rendered once accepted */}
          {gateState === 'accepted' && (
            <form onSubmit={handleSubmit} noValidate className="space-y-10">
              {sendError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
                  {sendError}
                </div>
              )}

              {/* Practice Information */}
              <fieldset className="space-y-6">
                <legend className="text-text-dark text-lg font-bold pb-3 border-b border-gray-100 w-full">
                  Your Practice Information
                </legend>

                {/* Practice Type */}
                <div>
                  <p className="text-sm font-semibold text-text-dark mb-2">
                    Practice Type <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRACTICE_TYPES.map(pt => (
                      <label key={pt} className="flex items-center gap-2.5 cursor-pointer text-sm text-text-gray hover:text-text-dark">
                        <input
                          type="radio"
                          name="practiceType"
                          value={pt}
                          checked={form.practiceType === pt}
                          onChange={handleChange}
                          className="accent-sliquid-blue"
                        />
                        {pt}
                      </label>
                    ))}
                  </div>
                  {errors.practiceType && <FieldError id={`${uid}-ptErr`} message={errors.practiceType} />}
                  {form.practiceType === 'Other (specify below)' && (
                    <div className="mt-3">
                      <Label htmlFor={`${uid}-ptOther`}>Please Specify</Label>
                      <input
                        id={`${uid}-ptOther`}
                        name="practiceTypeOther"
                        type="text"
                        value={form.practiceTypeOther}
                        onChange={handleChange}
                        placeholder="Describe your practice type"
                        className={inputCls()}
                      />
                    </div>
                  )}
                </div>

                {/* Practice Name */}
                <div>
                  <Label htmlFor={`${uid}-pname`} required>Practice Name</Label>
                  <input
                    id={`${uid}-pname`}
                    name="practiceName"
                    type="text"
                    value={form.practiceName}
                    onChange={handleChange}
                    aria-describedby={errors.practiceName ? `${uid}-pnameErr` : undefined}
                    className={inputCls(!!errors.practiceName)}
                  />
                  {errors.practiceName && <FieldError id={`${uid}-pnameErr`} message={errors.practiceName} />}
                </div>

                {/* Address */}
                <div className="space-y-3">
                  <Label htmlFor={`${uid}-street`} required>Practice Address</Label>
                  <input
                    id={`${uid}-street`}
                    name="streetAddress"
                    type="text"
                    placeholder="Street Address"
                    value={form.streetAddress}
                    onChange={handleChange}
                    aria-describedby={errors.streetAddress ? `${uid}-streetErr` : undefined}
                    className={inputCls(!!errors.streetAddress)}
                  />
                  {errors.streetAddress && <FieldError id={`${uid}-streetErr`} message={errors.streetAddress} />}
                  <input
                    name="addressLine2"
                    type="text"
                    placeholder="Address Line 2 (Suite, Unit, etc.)"
                    value={form.addressLine2}
                    onChange={handleChange}
                    className={inputCls()}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input
                        id={`${uid}-city`}
                        name="city"
                        type="text"
                        placeholder="City"
                        value={form.city}
                        onChange={handleChange}
                        aria-describedby={errors.city ? `${uid}-cityErr` : undefined}
                        className={inputCls(!!errors.city)}
                      />
                      {errors.city && <FieldError id={`${uid}-cityErr`} message={errors.city} />}
                    </div>
                    <div>
                      <input
                        id={`${uid}-state`}
                        name="state"
                        type="text"
                        placeholder="State / Province / Region"
                        value={form.state}
                        onChange={handleChange}
                        aria-describedby={errors.state ? `${uid}-stateErr` : undefined}
                        className={inputCls(!!errors.state)}
                      />
                      {errors.state && <FieldError id={`${uid}-stateErr`} message={errors.state} />}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input
                        id={`${uid}-zip`}
                        name="zip"
                        type="text"
                        placeholder="Postal / Zip Code"
                        value={form.zip}
                        onChange={handleChange}
                        aria-describedby={errors.zip ? `${uid}-zipErr` : undefined}
                        className={inputCls(!!errors.zip)}
                      />
                      {errors.zip && <FieldError id={`${uid}-zipErr`} message={errors.zip} />}
                    </div>
                    <input
                      name="country"
                      type="text"
                      placeholder="Country"
                      value={form.country}
                      onChange={handleChange}
                      className={inputCls()}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor={`${uid}-pphone`} required>Practice Phone Number</Label>
                  <input
                    id={`${uid}-pphone`}
                    name="practicePhone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={form.practicePhone}
                    onChange={handleChange}
                    aria-describedby={errors.practicePhone ? `${uid}-pphoneErr` : undefined}
                    className={inputCls(!!errors.practicePhone)}
                  />
                  {errors.practicePhone && <FieldError id={`${uid}-pphoneErr`} message={errors.practicePhone} />}
                </div>

                {/* Website */}
                <div>
                  <Label htmlFor={`${uid}-psite`}>Practice Website</Label>
                  <input
                    id={`${uid}-psite`}
                    name="practiceWebsite"
                    type="url"
                    placeholder="https://yourpractice.com"
                    value={form.practiceWebsite}
                    onChange={handleChange}
                    className={inputCls()}
                  />
                </div>
              </fieldset>

              {/* Contact Information */}
              <fieldset className="space-y-6">
                <legend className="text-text-dark text-lg font-bold pb-3 border-b border-gray-100 w-full">
                  Your Contact Information
                </legend>

                {/* Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`${uid}-fname`} required>First Name</Label>
                    <input
                      id={`${uid}-fname`}
                      name="firstName"
                      type="text"
                      value={form.firstName}
                      onChange={handleChange}
                      aria-describedby={errors.firstName ? `${uid}-fnameErr` : undefined}
                      className={inputCls(!!errors.firstName)}
                    />
                    {errors.firstName && <FieldError id={`${uid}-fnameErr`} message={errors.firstName} />}
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-lname`} required>Last Name</Label>
                    <input
                      id={`${uid}-lname`}
                      name="lastName"
                      type="text"
                      value={form.lastName}
                      onChange={handleChange}
                      aria-describedby={errors.lastName ? `${uid}-lnameErr` : undefined}
                      className={inputCls(!!errors.lastName)}
                    />
                    {errors.lastName && <FieldError id={`${uid}-lnameErr`} message={errors.lastName} />}
                  </div>
                </div>

                {/* Relationship */}
                <div>
                  <Label htmlFor={`${uid}-rel`}>Your Relationship to the Practice</Label>
                  <input
                    id={`${uid}-rel`}
                    name="relationship"
                    type="text"
                    placeholder="e.g. Office Manager, Physician, Student Rep"
                    value={form.relationship}
                    onChange={handleChange}
                    className={inputCls()}
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <Label htmlFor={`${uid}-cphone`} required>Phone Number</Label>
                  <input
                    id={`${uid}-cphone`}
                    name="contactPhone"
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={form.contactPhone}
                    onChange={handleChange}
                    aria-describedby={errors.contactPhone ? `${uid}-cphoneErr` : undefined}
                    className={inputCls(!!errors.contactPhone)}
                  />
                  {errors.contactPhone && <FieldError id={`${uid}-cphoneErr`} message={errors.contactPhone} />}
                </div>

                {/* Email */}
                <div>
                  <Label htmlFor={`${uid}-email`} required>Email</Label>
                  <input
                    id={`${uid}-email`}
                    name="email"
                    type="email"
                    placeholder="you@yourpractice.com"
                    value={form.email}
                    onChange={handleChange}
                    aria-describedby={errors.email ? `${uid}-emailErr` : undefined}
                    className={inputCls(!!errors.email)}
                  />
                  {errors.email && <FieldError id={`${uid}-emailErr`} message={errors.email} />}
                </div>

                {/* Preferred Contact */}
                <div>
                  <Label htmlFor={`${uid}-pref`}>Preferred Contact Method</Label>
                  <select
                    id={`${uid}-pref`}
                    name="preferredContact"
                    value={form.preferredContact}
                    onChange={handleChange}
                    className={inputCls()}
                  >
                    {['Email', 'Phone', 'Either'].map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Directory */}
                <div>
                  <p className="text-sm font-semibold text-text-dark mb-2">
                    Add your practice to the Sliquid Medical Partners page?
                  </p>
                  <div className="flex gap-6">
                    {['Yes', 'No'].map(v => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-text-gray">
                        <input
                          type="radio"
                          name="addToDirectory"
                          value={v}
                          checked={form.addToDirectory === v}
                          onChange={handleChange}
                          className="accent-sliquid-blue"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Opt in */}
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="optInEmail"
                      checked={form.optInEmail}
                      onChange={handleChange}
                      className="mt-0.5 accent-sliquid-blue"
                    />
                    <span className="text-sm text-text-gray leading-relaxed">
                      By requesting samples, I agree to receive email updates from Sliquid as part of the Medical Partners Program. <span className="text-red-500">*</span>
                    </span>
                  </label>
                  {errors.optInEmail && <FieldError id={`${uid}-optErr`} message={errors.optInEmail} />}
                </div>

                <p className="text-xs text-text-light-gray leading-relaxed">
                  Your information is used only to process your application and ship your samples. It will never be sold, shared, or used for any other purpose.
                </p>
              </fieldset>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto bg-sliquid-blue hover:bg-sliquid-dark-blue disabled:opacity-60 text-white font-semibold text-sm py-3.5 px-10 rounded-lg transition-colors flex items-center gap-2"
              >
                {submitting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
