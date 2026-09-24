import { useState, useId } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { sanitizeFormData } from '@/utils/sanitize'
import FormCooldownNotice, { useFormCooldown } from '@/components/FormCooldownNotice'
import i18n from '@/i18n'
import { serverErrorText } from '@/utils/serverError'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://sliquid-b2b-production.up.railway.app'

// Distinguishes a real, actionable message from our server (show verbatim) from
// any other failure — network drop, CORS, timeout, browser fetch internals — which
// should never be shown to the user raw (e.g. "Failed to fetch").
class HPApiError extends Error {}

// ─── Static data ──────────────────────────────────────────────────────────────

const HP_IMAGE =
  'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/ai-images/1/87ed7738-8b0b-425e-a09c-cb563cdd99c0.jpg'

// Copy for each lives in the `healthPractitioners` namespace, keyed by id.
const KEY_INGREDIENTS = [
  'purified-water', 'aloe-vera', 'vitamin-e', 'citric-acid', 'potassium-sorbate', 'plant-cellulose',
] as const

const REQUIREMENTS = ['professional', 'address', 'international', 'onePerPractice'] as const

const HOW_IT_WORKS = ['approval', 'shipping', 'additional'] as const

// `value` is what gets SUBMITTED (sales reads it) and stays English; `key` picks
// the translated label.
const PRACTICE_TYPES = [
  { value: 'OB/GYN', key: 'obgyn' },
  { value: 'Pelvic Floor Therapy', key: 'pelvicFloor' },
  { value: 'Sexual Health & Wellness', key: 'sexualHealth' },
  { value: 'General Practitioner', key: 'gp' },
  { value: 'Other (specify below)', key: 'other' },
] as const

const CONTACT_METHODS = ['Email', 'Phone', 'Either'] as const

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

function validate(d: HPFormData, t: TFunction<'healthPractitioners'>): HPFormErrors {
  const err: HPFormErrors = {}
  if (!d.practiceType) err.practiceType = t('errors.practiceTypeRequired')
  if (!d.practiceName.trim()) err.practiceName = t('errors.practiceNameRequired')
  if (!d.streetAddress.trim()) err.streetAddress = t('errors.streetRequired')
  if (!d.city.trim()) err.city = t('errors.cityRequired')
  if (!d.state.trim()) err.state = t('errors.stateRequired')
  if (!d.zip.trim()) err.zip = t('errors.zipRequired')
  if (!d.practicePhone.trim()) err.practicePhone = t('errors.practicePhoneRequired')
  if (!d.firstName.trim()) err.firstName = t('errors.firstNameRequired')
  if (!d.lastName.trim()) err.lastName = t('errors.lastNameRequired')
  if (!d.contactPhone.trim()) err.contactPhone = t('errors.contactPhoneRequired')
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = t('errors.emailInvalid')
  if (!d.optInEmail) err.optInEmail = t('errors.optInRequired')
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
   ${hasError ? 'border-red-500' : 'border-gray-500 focus:border-sliquid-blue'}`

// ─── Requirements Gate Modal ──────────────────────────────────────────────────

function RequirementsGate({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const { t } = useTranslation('healthPractitioners')
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
          {t('gate.title')}
        </h2>
        <p className="text-text-gray text-sm mb-5 leading-relaxed">
          {t('gate.body')}
        </p>
        <ul className="space-y-3 mb-7">
          {REQUIREMENTS.map((req, i) => (
            <li key={req} className="flex gap-3 text-sm text-text-gray leading-relaxed">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-sliquid-blue/10 text-sliquid-blue flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              {t(`program.requirements.${req}`)}
            </li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onAccept}
            className="flex-1 bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-6 rounded-lg transition-colors"
          >
            {t('gate.accept')}
          </button>
          <button
            onClick={onDecline}
            className="flex-1 border border-gray-200 text-text-gray hover:text-text-dark hover:border-gray-300 font-medium text-sm py-3 px-6 rounded-lg transition-colors"
          >
            {t('gate.decline')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Thank You Modal ──────────────────────────────────────────────────────────

function ThankYouModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('healthPractitioners')
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
          {t('thanks.title')}
        </h2>
        <p className="text-text-gray text-sm leading-relaxed mb-2">
          <Trans t={t} i18nKey="thanks.body" components={{ bold: <strong /> }} />
        </p>
        <p className="text-text-gray text-sm leading-relaxed mb-7">
          {t('thanks.decision')}
        </p>
        <button
          onClick={onClose}
          className="bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-8 rounded-lg transition-colors"
        >
          {t('thanks.done')}
        </button>
      </div>
    </div>
  )
}

// ─── Already Submitted Panel ───────────────────────────────────────────────────

function AlreadySubmittedPanel() {
  const { t } = useTranslation('healthPractitioners')
  return (
    <div className="bg-bg-off-white border border-gray-200 rounded-2xl p-8 text-center mb-8">
      <div className="w-12 h-12 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-text-dark font-semibold text-lg mb-2">{t('already.title')}</h3>
      <p className="text-text-gray text-sm max-w-md mx-auto leading-relaxed">
        {t('already.body')}
      </p>
    </div>
  )
}

// ─── Submitted Panel ────────────────────────────────────────────────────────────
// Replaces the form permanently after a successful submit — the ThankYouModal is
// just a transient overlay on top of this; dismissing the modal must never bring
// the form back, or a person can (and did) submit a second, real application.

function SubmittedPanel() {
  const { t } = useTranslation('healthPractitioners')
  return (
    <div className="bg-bg-off-white border border-gray-200 rounded-2xl p-8 text-center mb-8">
      <div className="w-12 h-12 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-text-dark font-semibold text-lg mb-2">{t('submittedPanel.title')}</h3>
      <p className="text-text-gray text-sm max-w-md mx-auto leading-relaxed">
        {t('submittedPanel.body')}
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HealthPractitionersPage() {
  const { t } = useTranslation('healthPractitioners')
  const uid = useId()
  const [activeTab, setActiveTab] = useState<'requirements' | 'how'>('requirements')
  const [gateState, setGateState] = useState<'hidden' | 'open' | 'accepted' | 'declined'>('hidden')
  const [form, setForm] = useState<HPFormData>(EMPTY)
  const [errors, setErrors] = useState<HPFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showThankYouModal, setShowThankYouModal] = useState(false)
  const [sendError, setSendError] = useState('')
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const cooldown = useFormCooldown('hp-apply')

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
    const errs = validate(form, t)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true); setSendError('')
    try {
      const safe = sanitizeFormData(form)
      const res = await fetch(`${API_BASE}/api/b2b/hp-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          practiceType:     safe.practiceType + (safe.practiceTypeOther ? ` — ${safe.practiceTypeOther}` : ''),
          practiceName:     safe.practiceName,
          practiceAddress:  [safe.streetAddress, safe.addressLine2, safe.city, safe.state, safe.zip, safe.country].filter(Boolean).join(', '),
          practicePhone:    safe.practicePhone,
          practiceWebsite:  safe.practiceWebsite || '',
          contactName:      `${safe.firstName} ${safe.lastName}`,
          relationship:     safe.relationship || '',
          email:            safe.email,
          contactPhone:     safe.contactPhone,
          preferredContact: safe.preferredContact,
          addToDirectory:   safe.addToDirectory,
          language:         i18n.resolvedLanguage ?? 'en',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as {
          message?: string; code?: string; params?: Record<string, unknown>; alreadySubmitted?: boolean; retryAfterMinutes?: number
        }
        if (data.alreadySubmitted) {
          // Keep the existing dedicated screen, but also start the clock so a
          // reload shows the cooldown notice instead of an empty form.
          cooldown.lock(data.retryAfterMinutes ?? 60)
          setAlreadySubmitted(true)
          return
        }
        throw new HPApiError(serverErrorText(data, t('errors.serverUnexpected')))
      }
      cooldown.start()
      setSubmitted(true)
      setShowThankYouModal(true)
    } catch (err) {
      setSendError(
        err instanceof HPApiError
          ? err.message
          : t('errors.network')
      )
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

      {/* Thank you modal — dismissing this only closes the overlay; it never
          resets `submitted`, so the form underneath cannot be reopened/resubmitted */}
      {showThankYouModal && (
        <ThankYouModal onClose={() => setShowThankYouModal(false)} />
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-3">
            {t('hero.eyebrow')}
          </p>
          <h1 className="text-text-dark text-[34px] md:text-[46px] font-bold tracking-tight leading-tight mb-5">
            {t('hero.title')}
          </h1>
          <p className="text-text-gray text-base md:text-lg leading-relaxed mb-8">
            {t('hero.body')}
          </p>
          <a
            href="#apply"
            className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-7 rounded-lg transition-colors"
          >
            {t('hero.cta')}
          </a>
        </div>
      </section>

      {/* ── Key Ingredients ─────────────────────────────────────────────── */}
      <section className="py-14 md:py-20" aria-labelledby="ingredients-heading">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 id="ingredients-heading" className="text-text-dark text-[28px] md:text-[32px] font-bold tracking-tight mb-4">
              {t('ingredients.heading')}
            </h2>
            <p className="text-text-gray text-base leading-relaxed">
              {t('ingredients.body')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {KEY_INGREDIENTS.map(id => (
              <div
                key={id}
                className="bg-bg-off-white rounded-xl p-6 border border-gray-100"
              >
                <span className="inline-block bg-sliquid-blue/10 text-sliquid-blue text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3">
                  {t(`ingredients.items.${id}.tag`)}
                </span>
                <h3 className="text-text-dark text-[15px] font-semibold mb-2">{t(`ingredients.items.${id}.name`)}</h3>
                <p className="text-text-gray text-sm leading-relaxed">{t(`ingredients.items.${id}.description`)}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-text-gray text-sm">
            <Trans
              t={t}
              i18nKey="ingredients.fullBreakdown"
              components={{ cta: <a href="/ingredients" className="text-sliquid-blue hover:underline font-medium" /> }}
            />
          </p>
        </div>
      </section>

      {/* ── Image break ─────────────────────────────────────────────────── */}
      <div className="w-full h-[420px] md:h-[500px] overflow-hidden">
        <img
          src={HP_IMAGE}
          alt={t('imageAlt')}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-full object-cover"
        />
      </div>

      {/* ── Requirements / How It Works tabs ────────────────────────────── */}
      <section className="py-14 md:py-20 bg-bg-off-white" aria-labelledby="program-heading">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 id="program-heading" className="text-text-dark text-[28px] md:text-[32px] font-bold tracking-tight mb-6 text-center">
            {t('program.heading')}
          </h2>

          {/* Tab switcher */}
          <div className="flex justify-center gap-2 mb-8" role="group" aria-label={t('program.tabsLabel')}>
            {(['requirements', 'how'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors
                  ${activeTab === tab
                    ? 'bg-sliquid-blue text-white'
                    : 'bg-white text-text-gray border border-gray-500 hover:border-sliquid-blue hover:text-sliquid-blue'
                  }`}
              >
                {tab === 'requirements' ? t('program.tabRequirements') : t('program.tabHow')}
              </button>
            ))}
          </div>

          {activeTab === 'requirements' && (
            <div className="space-y-4">
              {REQUIREMENTS.map((req, i) => (
                <div key={req} className="flex gap-4 bg-white rounded-xl p-5 border border-gray-100">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sliquid-blue/10 text-sliquid-blue flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-text-gray text-sm leading-relaxed">{t(`program.requirements.${req}`)}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'how' && (
            <div className="space-y-4">
              {HOW_IT_WORKS.map(block => (
                <p key={block} className="text-text-gray text-sm leading-relaxed bg-white rounded-xl p-5 border border-gray-100">
                  {t(`program.how.${block}`)}
                </p>
              ))}
              <p className="text-text-gray/70 text-xs italic pt-2">
                {t('program.how.shippingNote')}
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
              {t('form.heading')}
            </h2>
            <p className="text-text-gray text-base">
              {t('form.intro')}
            </p>
          </div>

          {submitted ? (
            <SubmittedPanel />
          ) : alreadySubmitted ? (
            <AlreadySubmittedPanel />
          ) : cooldown.blocked ? (
            <FormCooldownNotice minutes={cooldown.minutesLeft} noun="application" />
          ) : (
          <>
          {/* Gate — show prompt if not yet accepted */}
          {gateState !== 'accepted' && gateState !== 'declined' && (
            <div
              className="bg-bg-off-white border border-gray-200 rounded-2xl p-8 text-center mb-8 cursor-pointer hover:border-sliquid-blue/40 transition-colors"
              onClick={openGate}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && openGate()}
              aria-label={t('gate.promptAria')}
            >
              <div className="w-12 h-12 bg-sliquid-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-text-dark font-semibold text-lg mb-2">{t('gate.promptTitle')}</h3>
              <p className="text-text-gray text-sm max-w-md mx-auto mb-5">
                {t('gate.promptBody')}
              </p>
              <span className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold text-sm py-3 px-7 rounded-lg transition-colors">
                {t('gate.promptCta')}
              </span>
            </div>
          )}

          {gateState === 'declined' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8">
              <p className="text-amber-800 text-sm font-medium">
                <Trans
                  t={t}
                  i18nKey="gate.declined"
                  components={{ cta: <a href="/contact" className="underline hover:text-amber-900" /> }}
                />
              </p>
              <button
                onClick={() => setGateState('hidden')}
                className="mt-3 text-xs text-amber-700 underline hover:text-amber-900"
              >
                {t('gate.reviewAgain')}
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
                  {t('form.practiceLegend')}
                </legend>

                {/* Practice Type */}
                <div>
                  <p className="text-sm font-semibold text-text-dark mb-2">
                    {t('form.practiceType')} <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRACTICE_TYPES.map(pt => (
                      <label key={pt.value} className="flex items-center gap-2.5 cursor-pointer text-sm text-text-gray hover:text-text-dark">
                        <input
                          type="radio"
                          name="practiceType"
                          value={pt.value}
                          checked={form.practiceType === pt.value}
                          onChange={handleChange}
                          className="accent-sliquid-blue"
                        />
                        {t(`form.practiceTypes.${pt.key}`)}
                      </label>
                    ))}
                  </div>
                  {errors.practiceType && <FieldError id={`${uid}-ptErr`} message={errors.practiceType} />}
                  {form.practiceType === 'Other (specify below)' && (
                    <div className="mt-3">
                      <Label htmlFor={`${uid}-ptOther`}>{t('form.specify')}</Label>
                      <input
                        id={`${uid}-ptOther`}
                        name="practiceTypeOther"
                        type="text"
                        value={form.practiceTypeOther}
                        onChange={handleChange}
                        placeholder={t('form.specifyPlaceholder')}
                        className={inputCls()}
                      />
                    </div>
                  )}
                </div>

                {/* Practice Name */}
                <div>
                  <Label htmlFor={`${uid}-pname`} required>{t('form.practiceName')}</Label>
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
                  <Label htmlFor={`${uid}-street`} required>{t('form.practiceAddress')}</Label>
                  <input
                    id={`${uid}-street`}
                    name="streetAddress"
                    type="text"
                    placeholder={t('form.street')}
                    value={form.streetAddress}
                    onChange={handleChange}
                    aria-describedby={errors.streetAddress ? `${uid}-streetErr` : undefined}
                    className={inputCls(!!errors.streetAddress)}
                  />
                  {errors.streetAddress && <FieldError id={`${uid}-streetErr`} message={errors.streetAddress} />}
                  <input
                    name="addressLine2"
                    type="text"
                    placeholder={t('form.addressLine2')}
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
                        placeholder={t('form.city')}
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
                        placeholder={t('form.state')}
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
                        placeholder={t('form.zip')}
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
                      placeholder={t('form.country')}
                      value={form.country}
                      onChange={handleChange}
                      className={inputCls()}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <Label htmlFor={`${uid}-pphone`} required>{t('form.practicePhone')}</Label>
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
                  <Label htmlFor={`${uid}-psite`}>{t('form.practiceWebsite')}</Label>
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
                  {t('form.contactLegend')}
                </legend>

                {/* Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`${uid}-fname`} required>{t('form.firstName')}</Label>
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
                    <Label htmlFor={`${uid}-lname`} required>{t('form.lastName')}</Label>
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
                  <Label htmlFor={`${uid}-rel`}>{t('form.relationship')}</Label>
                  <input
                    id={`${uid}-rel`}
                    name="relationship"
                    type="text"
                    placeholder={t('form.relationshipPlaceholder')}
                    value={form.relationship}
                    onChange={handleChange}
                    className={inputCls()}
                  />
                </div>

                {/* Contact Phone */}
                <div>
                  <Label htmlFor={`${uid}-cphone`} required>{t('form.contactPhone')}</Label>
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
                  <Label htmlFor={`${uid}-email`} required>{t('form.email')}</Label>
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
                  <Label htmlFor={`${uid}-pref`}>{t('form.preferredContact')}</Label>
                  <select
                    id={`${uid}-pref`}
                    name="preferredContact"
                    value={form.preferredContact}
                    onChange={handleChange}
                    className={inputCls()}
                  >
                    {CONTACT_METHODS.map(v => (
                      <option key={v} value={v}>{t(`form.contactMethods.${v}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Directory */}
                <div>
                  <p className="text-sm font-semibold text-text-dark mb-2">
                    {t('form.directory')}
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
                        {v === 'Yes' ? t('form.yes') : t('form.no')}
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
                      {t('form.optIn')} <span className="text-red-500">*</span>
                    </span>
                  </label>
                  {errors.optInEmail && <FieldError id={`${uid}-optErr`} message={errors.optInEmail} />}
                </div>

                <p className="text-xs text-text-light-gray leading-relaxed">
                  {t('form.privacy')}
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
                {submitting ? t('form.submitting') : t('form.submit')}
              </button>
            </form>
          )}
          </>
          )}
        </div>
      </section>
    </>
  )
}
