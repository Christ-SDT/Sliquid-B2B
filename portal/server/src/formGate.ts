import { db } from './database.js'

/**
 * Shared submission cooldown for the public intake forms.
 *
 * One submission per (form, email address) per hour. The window is enforced
 * SERVER-side and is the only authoritative gate — the client-side lock in
 * `src/utils/formCooldown.ts` is a courtesy so the visitor sees the state
 * without a round trip, and clearing localStorage bypasses it entirely.
 *
 * Scope note: this guards INTAKE forms only. Auth flows (login, register,
 * forgot-password, reset-password) are deliberately excluded — an hour-long
 * lockout on password reset turns a mistyped email into a support ticket.
 */
export const FORM_COOLDOWN_MINUTES = 60

/** Every form_key in use. Keeping them in one place stops a typo'd key from
 *  silently creating a second, never-matching bucket that gates nothing. */
export const FORM_KEYS = {
  contact:         'b2b_contact',
  retailerApply:   'b2b_retailer_apply',
  retailerCheckin: 'b2b_retailer_checkin',
  hpApply:         'b2b_hp_apply',
  boothSignup:     'b2b_booth_signup',
  // Split by request type on purpose: exercising your right of access must not
  // consume the window for a subsequent deletion request. They are two
  // different legal asks that happen to share a form.
  gdprAccess:      'gdpr_request_access',
  gdprDeletion:    'gdpr_request_deletion',
} as const

export type FormKey = (typeof FORM_KEYS)[keyof typeof FORM_KEYS]

export interface CooldownState {
  blocked: boolean
  /** Whole minutes until the caller may submit again; 0 when not blocked. */
  retryAfterMinutes: number
}

/**
 * Has this email already submitted this form inside the window?
 *
 * Email is matched case-insensitively and compared against a SQLite-computed
 * cutoff, so the window can never drift with the Node process clock or a
 * timezone. Returns the remaining minutes so the caller can say something
 * more useful than "try later".
 */
export function checkFormCooldown(formKey: FormKey, email: string): CooldownState {
  const row = db.prepare(
    `SELECT CAST(
              (julianday(created_at, '+${FORM_COOLDOWN_MINUTES} minutes') - julianday('now'))
              * 24 * 60 AS INTEGER
            ) AS minutes_left
       FROM form_submissions
      WHERE form_key = ?
        AND LOWER(email) = LOWER(?)
        AND created_at >= datetime('now', '-${FORM_COOLDOWN_MINUTES} minutes')
      ORDER BY created_at DESC
      LIMIT 1`,
  ).get(formKey, email) as { minutes_left: number } | undefined

  if (!row) return { blocked: false, retryAfterMinutes: 0 }
  // Round a sub-minute remainder up to 1 — "try again in 0 minutes" alongside a
  // refusal reads as a bug.
  return { blocked: true, retryAfterMinutes: Math.max(1, row.minutes_left) }
}

/**
 * Record a submission, starting the clock.
 *
 * Call this only AFTER the work succeeded. Recording up front would mean a
 * transient EmailJS outage locks the visitor out for an hour from a submission
 * that never reached anyone — the exact failure the hp-apply rollback was
 * written to undo.
 */
export function recordFormSubmission(formKey: FormKey, email: string): void {
  db.prepare('INSERT INTO form_submissions (form_key, email) VALUES (?, ?)')
    .run(formKey, email.trim().toLowerCase())
}

/** The 429 body every gated route returns, so the shape is identical everywhere. */
export function cooldownResponse(state: CooldownState, formLabel: string) {
  return {
    alreadySubmitted: true,
    retryAfterMinutes: state.retryAfterMinutes,
    message:
      `We've already received your ${formLabel} — our team is on it. ` +
      `You can send another in about ${state.retryAfterMinutes} minute${state.retryAfterMinutes === 1 ? '' : 's'}.`,
  }
}
