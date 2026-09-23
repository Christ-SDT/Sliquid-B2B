import { useState, useEffect, useId } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { sanitizeFormData } from '@/utils/sanitize'
import { API_BASE, BRANDS, RETAILER_CONTACTS } from '@/utils/constants'
import FormCooldownNotice, { useFormCooldown } from '@/components/FormCooldownNotice'

// ─── Static data ──────────────────────────────────────────────────────────────

// `value` is SUBMITTED as-is (sales reads it in the email) and stays English;
// `key` picks the translated label under retailerCheckIn:form.*.
/** What a partner might want from us — drives the "How can we help?" checkboxes. */
const INTERESTS = [
  { value: 'Reorder / place an order', key: 'reorder' },
  { value: 'New product & launch info', key: 'launches' },
  { value: 'In-store marketing materials', key: 'inStore' },
  { value: 'Staff training & certification', key: 'training' },
  { value: 'Updated product images and copy', key: 'images' },
  { value: 'Store Locator listing', key: 'storeLocator' },
  { value: 'MAP or pricing question', key: 'pricing' },
] as const

const FEEDBACK_OPTIONS = [
  { value: 'Love it', key: 'love' },
  { value: 'Looks good', key: 'good' },
  { value: "Haven't looked yet", key: 'notYet' },
  { value: 'Some notes for you', key: 'notes' },
] as const

// RETAILER_CONTACTS values (constants.ts) are submitted verbatim for lead
// routing, so they stay English; this maps each to a translated label. A contact
// added to the constant without an entry here just shows its English value.
const CONTACT_LABEL_KEYS: Record<string, string> = {
  'Michelle Marcus — VP of Sales': 'michelle',
  'Colin Roy — Senior Vice President': 'colin',
  'Erik Vasquez — VP of Marketing': 'erik',
  'My distributor rep': 'distributor',
  "Not sure / I don't have one": 'notSure',
}

const GATE_KEY = 'sliquid_retailer_checkin_confirmed'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckInFormData {
  company: string
  contactName: string
  email: string
  phone: string
  pointOfContact: string
  brandsCarried: string[]
  interests: string[]
  siteFeedback: string
  comments: string
}

interface CheckInFormErrors {
  company?: string
  contactName?: string
  email?: string
}

const EMPTY: CheckInFormData = {
  company: '',
  contactName: '',
  email: '',
  phone: '',
  pointOfContact: '',
  brandsCarried: [],
  interests: [],
  siteFeedback: '',
  comments: '',
}

/**
 * Only the three fields we need to route the check-in are required. This is an
 * existing partner doing us a favour by answering — a wall of red asterisks is
 * the wrong greeting, and we already hold their address and MAP agreement.
 */
function validate(d: CheckInFormData, t: TFunction<'retailerCheckIn'>): CheckInFormErrors {
  const err: CheckInFormErrors = {}
  if (!d.company.trim()) err.company = t('errors.companyRequired')
  if (!d.contactName.trim()) err.contactName = t('errors.nameRequired')
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(d.email)) err.email = t('errors.emailInvalid')
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

/** The "you're in the wrong place, and that's fine" button. Repeated on the
 *  gate, in the page body and on the decline screen — a prospect who lands on a
 *  link a customer forwarded them should never have to hunt for the real form. */
function ApplyInsteadLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation('retailerCheckIn')
  return (
    <a
      href="/become-a-retailer"
      className={`inline-flex items-center gap-2 rounded-lg border border-sliquid-blue px-6 py-3 text-sm font-semibold text-sliquid-blue transition-colors hover:bg-sliquid-blue hover:text-white ${className}`}
    >
      {t('applyInstead')}
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
      </svg>
    </a>
  )
}

// ─── Gate ─────────────────────────────────────────────────────────────────────

function Gate({ onConfirm, onDecline }: { onConfirm: () => void; onDecline: () => void }) {
  const { t } = useTranslation('retailerCheckIn')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-gate-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl md:p-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-sliquid-blue">
          {t('gate.eyebrow')}
        </p>
        <h2 id="checkin-gate-title" className="mb-3 text-[26px] font-bold leading-tight tracking-tight text-text-dark">
          {t('gate.title')}
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-text-gray">
          {t('gate.body')}
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-sliquid-blue px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-sliquid-dark-blue"
          >
            {t('gate.yes')}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="rounded-lg border border-gray-200 px-6 py-3.5 text-sm font-semibold text-text-gray transition-colors hover:border-sliquid-blue hover:text-sliquid-blue"
          >
            {t('gate.no')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeclineScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('retailerCheckIn')
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-xl px-4 text-center sm:px-6">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-sliquid-blue/10">
          <svg className="h-7 w-7 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" />
          </svg>
        </div>
        <h1 className="mb-4 text-[30px] font-bold tracking-tight text-text-dark">
          {t('declined.title')}
        </h1>
        <p className="mb-8 text-base leading-relaxed text-text-gray">
          {t('declined.body')}
        </p>
        <div className="flex flex-col items-center gap-4">
          <ApplyInsteadLink />
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-text-light-gray underline-offset-2 hover:text-sliquid-blue hover:underline"
          >
            {t('declined.back')}
          </button>
        </div>
      </div>
    </section>
  )
}

// ─── Thank You ────────────────────────────────────────────────────────────────

function ThankYou({ referenceNumber, onClose }: { referenceNumber: string; onClose: () => void }) {
  const { t } = useTranslation('retailerCheckIn')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-thankyou-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sliquid-blue/10">
          <svg className="h-7 w-7 text-sliquid-blue" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="checkin-thankyou-title" className="mb-3 text-2xl font-bold text-text-dark">
          {t('thanks.title')}
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-text-gray">
          {t('thanks.body')}
        </p>

        <div className="mb-7 rounded-lg border border-gray-200 bg-bg-off-white px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-text-light-gray">
            {t('thanks.reference')}
          </p>
          <p className="text-lg font-bold tracking-wide text-sliquid-blue">{referenceNumber}</p>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg bg-sliquid-blue px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-sliquid-dark-blue"
        >
          {t('thanks.done')}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RetailerCheckInPage() {
  const { t } = useTranslation('retailerCheckIn')
  const uid = useId()
  // 'gate' → 'form' | 'declined'. sessionStorage so a refresh or a jump to the
  // form anchor doesn't re-ask someone who already answered.
  const [stage, setStage] = useState<'gate' | 'form' | 'declined'>(() =>
    typeof window !== 'undefined' && window.sessionStorage.getItem(GATE_KEY) === 'yes' ? 'form' : 'gate',
  )
  const [form, setForm] = useState<CheckInFormData>(EMPTY)
  const [errors, setErrors] = useState<CheckInFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [reference, setReference] = useState('')
  const [sendError, setSendError] = useState('')
  const cooldown = useFormCooldown('retailer-checkin')

  // Unlisted, not secret — but it is mailed to named partners, so keep it out of
  // search results. Removed on unmount so it never leaks onto another route.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  function confirmGate() {
    window.sessionStorage.setItem(GATE_KEY, 'yes')
    setStage('form')
  }

  function declineGate() {
    window.sessionStorage.removeItem(GATE_KEY)
    setStage('declined')
  }

  function toggleInArray(field: 'brandsCarried' | 'interests', value: string, checked: boolean) {
    setForm(prev => ({
      ...prev,
      [field]: checked ? [...prev[field], value] : prev[field].filter(v => v !== value),
    }))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate(form, t)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true)
    setSendError('')
    try {
      const safe = sanitizeFormData(form)
      const res = await fetch(`${API_BASE}/api/b2b/retailer-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company:        safe.company,
          contactName:    safe.contactName,
          email:          safe.email,
          phone:          safe.phone,
          pointOfContact: safe.pointOfContact,
          brandsCarried:  safe.brandsCarried.join(', '),
          interests:      safe.interests.join(', '),
          siteFeedback:   safe.siteFeedback,
          comments:       safe.comments,
        }),
      })
      const data = await res.json().catch(() => ({})) as {
        message?: string; referenceNumber?: string; retryAfterMinutes?: number
      }
      if (res.status === 429) {
        // The server knows the real remaining time — trust it over this browser.
        cooldown.lock(data.retryAfterMinutes ?? 60)
        setSendError(data.message ?? t('errors.alreadyCheckedIn'))
        return
      }
      if (!res.ok) throw new Error(data.message ?? 'Request failed')
      cooldown.start()
      setReference(data.referenceNumber ?? '')
    } catch (err) {
      setSendError(
        err instanceof Error && err.message !== 'Request failed'
          ? err.message
          : t('errors.sendFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (stage === 'declined') {
    return <DeclineScreen onBack={confirmGate} />
  }

  return (
    <>
      {stage === 'gate' && <Gate onConfirm={confirmGate} onDecline={declineGate} />}
      {reference && (
        <ThankYou
          referenceNumber={reference}
          onClose={() => { setReference(''); setForm(EMPTY) }}
        />
      )}

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white py-14 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-sliquid-blue">
            {t('hero.eyebrow')}
          </p>
          <h1 className="mb-5 text-[34px] font-bold leading-tight tracking-tight text-text-dark md:text-[46px]">
            {t('hero.title')}
          </h1>
          <p className="mb-4 text-base leading-relaxed text-text-gray md:text-lg">
            {t('hero.body')}
          </p>
          <p className="text-base leading-relaxed text-text-gray md:text-lg">
            <Trans t={t} i18nKey="hero.newLook" components={{ bold: <span className="font-semibold text-text-dark" /> }} />
          </p>
        </div>
      </section>

      {/* ── Brands ──────────────────────────────────────────────────────── */}
      <section className="py-14 md:py-20" aria-labelledby="checkin-brands-heading">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 id="checkin-brands-heading" className="mb-3 text-[26px] font-bold tracking-tight text-text-dark md:text-[32px]">
              {t('brands.heading')}
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-gray md:text-base">
              {t('brands.body')}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {BRANDS.map(brand => (
              <article
                key={brand.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-lg"
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-bg-off-white">
                  <img
                    src={brand.imageUrl}
                    alt={t(`common:brands.${brand.id}.imageAlt`)}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="mb-1 text-lg font-bold tracking-tight text-text-dark">{brand.name}</h3>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-sliquid-blue">
                    {t(`common:brands.${brand.id}.tagline`)}
                  </p>
                  <p className="mb-5 flex-1 text-sm leading-relaxed text-text-gray">
                    {t(`common:brands.${brand.id}.description`)}
                  </p>
                  <a
                    href={brand.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-sliquid-blue hover:underline"
                  >
                    {t('brands.visit', { name: brand.name })}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form ────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white py-14 md:py-24" aria-labelledby="checkin-form-heading">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="mb-8">
            <h2 id="checkin-form-heading" className="border-b border-gray-200 pb-4 text-[22px] font-bold tracking-tight text-text-dark">
              {t('form.heading')}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-text-gray">
              {t('form.intro')}
            </p>
          </div>

          {cooldown.blocked ? (
            <FormCooldownNotice minutes={cooldown.minutesLeft} noun="check-in" />
          ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {sendError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {sendError}
              </div>
            )}

            {/* Store / Company */}
            <div>
              <Label htmlFor={`${uid}-company`} required>{t('form.company')}</Label>
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
              <Label htmlFor={`${uid}-name`} required>{t('form.name')}</Label>
              <input
                id={`${uid}-name`}
                name="contactName"
                type="text"
                value={form.contactName}
                onChange={handleChange}
                aria-describedby={errors.contactName ? `${uid}-nameErr` : undefined}
                className={inputCls(!!errors.contactName)}
              />
              {errors.contactName && <FieldError id={`${uid}-nameErr`} message={errors.contactName} />}
            </div>

            {/* Email + Phone */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${uid}-email`} required>{t('form.email')}</Label>
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
              <div>
                <Label htmlFor={`${uid}-phone`}>{t('form.phone')}</Label>
                <input
                  id={`${uid}-phone`}
                  name="phone"
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={form.phone}
                  onChange={handleChange}
                  className={inputCls()}
                />
              </div>
            </div>

            {/* Point of contact */}
            <div>
              <Label htmlFor={`${uid}-poc`}>{t('form.pointOfContact')}</Label>
              <select
                id={`${uid}-poc`}
                name="pointOfContact"
                value={form.pointOfContact}
                onChange={handleChange}
                className={inputCls()}
              >
                <option value="">{t('form.selectContact')}</option>
                {RETAILER_CONTACTS.map(c => (
                  <option key={c} value={c}>
                    {CONTACT_LABEL_KEYS[c] ? t(`form.contacts.${CONTACT_LABEL_KEYS[c]}`) : c}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-text-light-gray">
                {t('form.contactHelp')}
              </p>
            </div>

            {/* Brands carried */}
            <div>
              <p className="mb-2 text-sm font-semibold text-text-dark">{t('form.brandsCarried')}</p>
              <div className="grid gap-y-2 sm:grid-cols-2">
                {BRANDS.map(brand => (
                  <label key={brand.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-text-gray hover:text-text-dark">
                    <input
                      type="checkbox"
                      value={brand.name}
                      checked={form.brandsCarried.includes(brand.name)}
                      onChange={e => toggleInArray('brandsCarried', brand.name, e.target.checked)}
                      className="accent-sliquid-blue"
                    />
                    {brand.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Interests */}
            <div>
              <p className="mb-2 text-sm font-semibold text-text-dark">{t('form.interestsHeading')}</p>
              <div className="grid gap-y-2 sm:grid-cols-2">
                {INTERESTS.map(item => (
                  <label key={item.value} className="flex cursor-pointer items-start gap-2.5 text-sm text-text-gray hover:text-text-dark">
                    <input
                      type="checkbox"
                      value={item.value}
                      checked={form.interests.includes(item.value)}
                      onChange={e => toggleInArray('interests', item.value, e.target.checked)}
                      className="mt-0.5 accent-sliquid-blue"
                    />
                    {t(`form.interests.${item.key}`)}
                  </label>
                ))}
              </div>
            </div>

            {/* New look feedback */}
            <div>
              <p className="mb-2 text-sm font-semibold text-text-dark">{t('form.feedbackHeading')}</p>
              <div className="grid gap-y-2 sm:grid-cols-2">
                {FEEDBACK_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-text-gray hover:text-text-dark">
                    <input
                      type="radio"
                      name="siteFeedback"
                      value={opt.value}
                      checked={form.siteFeedback === opt.value}
                      onChange={handleChange}
                      className="accent-sliquid-blue"
                    />
                    {t(`form.feedback.${opt.key}`)}
                  </label>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div>
              <Label htmlFor={`${uid}-comments`}>{t('form.comments')}</Label>
              <textarea
                id={`${uid}-comments`}
                name="comments"
                rows={5}
                placeholder={t('form.commentsPlaceholder')}
                value={form.comments}
                onChange={handleChange}
                className={`${inputCls()} resize-y`}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-sliquid-blue px-10 py-3 text-sm font-semibold text-white transition-colors hover:bg-sliquid-dark-blue disabled:opacity-60"
            >
              {submitting && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {submitting ? t('form.submitting') : t('form.submit')}
            </button>
          </form>
          )}
        </div>
      </section>

      {/* ── Not a retailer yet ──────────────────────────────────────────── */}
      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="mb-3 text-[22px] font-bold tracking-tight text-text-dark">
            {t('notRetailer.title')}
          </h2>
          <p className="mb-7 text-sm leading-relaxed text-text-gray md:text-base">
            {t('notRetailer.body')}
          </p>
          <ApplyInsteadLink />
        </div>
      </section>
    </>
  )
}
