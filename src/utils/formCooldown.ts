/**
 * Client-side mirror of the server's one-hour submission gate.
 *
 * This is a COURTESY, not a control. The authoritative guard is
 * `portal/server/src/formGate.ts`, which keys on the submitted email address;
 * this only stops the visitor refilling a long form just to be told no. It is
 * per-browser, so it neither catches someone switching devices nor punishes
 * someone whose colleague submitted from the same machine — both are the
 * server's job.
 *
 * Not every gated form gets one. The Erospain booth page runs on a SHARED
 * kiosk at a trade show: a browser-level lock there would turn one signup into
 * a closed sign-up sheet for everyone behind them in the queue. That form
 * relies on the server gate alone, which keys on the email and so lets the
 * next visitor through.
 */
export const COOLDOWN_MS = 60 * 60 * 1000

const KEY_PREFIX = 'sliquid_form_submitted:'

/** Keys must match nothing on the server — they only namespace localStorage. */
export type FormId =
  | 'contact'
  | 'retailer-apply'
  | 'retailer-checkin'
  | 'hp-apply'
  | 'booth-signup'
  | 'gdpr-access'
  | 'gdpr-deletion'

function read(formId: FormId): number | null {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + formId)
    if (!raw) return null
    const at = Number(raw)
    return Number.isFinite(at) ? at : null
  } catch {
    // Safari private mode throws on localStorage access. A visitor who cannot
    // be tracked simply gets no client-side lock; the server still holds.
    return null
  }
}

/** Minutes left in the window, or 0 if the form is free to submit. */
export function cooldownMinutesLeft(formId: FormId): number {
  const at = read(formId)
  if (at === null) return 0
  const remaining = at + COOLDOWN_MS - Date.now()
  if (remaining <= 0) return 0
  return Math.max(1, Math.ceil(remaining / 60000))
}

export function isOnCooldown(formId: FormId): boolean {
  return cooldownMinutesLeft(formId) > 0
}

/** Start the clock. Call only after the server confirmed the submission. */
export function markSubmitted(formId: FormId): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + formId, String(Date.now()))
  } catch { /* see read() */ }
}

/** Escape hatch for local testing — not wired to any UI. */
export function clearCooldown(formId: FormId): void {
  try {
    window.localStorage.removeItem(KEY_PREFIX + formId)
  } catch { /* see read() */ }
}

/** The banner copy, shared so every form says the same thing. */
export function cooldownMessage(minutes: number, noun = 'submission'): string {
  return `We've already received your ${noun} — our team is on it. ` +
    `You can send another in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
}
