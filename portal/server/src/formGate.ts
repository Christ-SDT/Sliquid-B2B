import { db } from './database.js'
import { loadBlocklist, matchBlocklist, type Identity } from './blocklist.js'

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
export function recordFormSubmission(formKey: FormKey, email: string, name?: string): void {
  db.prepare('INSERT INTO form_submissions (form_key, email, name) VALUES (?, ?, ?)')
    .run(formKey, email.trim().toLowerCase(), name?.trim().toLowerCase() || null)
}

/**
 * How many submissions this identity has already got through.
 *
 * Matches on email OR name, so changing one but not the other does not reset
 * the count — which is the whole point, since a determined sender rotates the
 * address long before they rotate the name they typed.
 *
 * Counts DELIVERED submissions only: `form_submissions` rows are written after
 * the work succeeded, so a failed send never counts against anyone.
 */
export function countPriorSubmissions(formKey: FormKey, id: Identity): number {
  const { repeatLimit } = loadBlocklist()
  const email = id.email?.trim().toLowerCase() || null
  const name = id.name?.trim().toLowerCase() || null
  if (!email && !name) return 0

  // Named params, and only the ones the SQL actually references — better-sqlite3
  // throws on an unknown named parameter, so the bindings are built alongside
  // the clauses rather than passed as one fixed object.
  const bound: Record<string, string | null> = { email }
  const clauses: string[] = []

  if (repeatLimit.matchOn === 'email') {
    if (!email) return 0
    clauses.push('email = :email')
  } else {
    clauses.push('( (:email IS NOT NULL AND email = :email) OR (:name IS NOT NULL AND name = :name) )')
    bound.name = name
  }

  if (repeatLimit.scope !== 'all') {
    clauses.push('form_key = :formKey')
    bound.formKey = formKey
  }
  if (repeatLimit.windowDays > 0) {
    // Interpolated, not bound: SQLite will not take a parameter inside the
    // modifier string of datetime(). Safe because the value is clamped to a
    // non-negative number by the blocklist parser and floored here.
    clauses.push(`created_at >= datetime('now', '-${Math.floor(repeatLimit.windowDays)} days')`)
  }

  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM form_submissions WHERE ${clauses.join(' AND ')}`,
  ).get(bound) as { c: number }
  return row.c
}

export type ScreenResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }

/**
 * The single gate every public form calls. Three checks, in order of how
 * decisively they settle the question:
 *
 *   1. blocklist  — an admin named this sender in blocklist.json
 *   2. repeatLimit — they have already had N submissions delivered
 *   3. cooldown   — they submitted within the last hour
 *
 * Blocklist first so a listed sender never learns anything from the timing or
 * wording of a cooldown message.
 */
export function screenSubmission(
  formKey: FormKey,
  id: Identity & { label: string },
): ScreenResult {
  const list = loadBlocklist()

  const hit = matchBlocklist(id, list)
  if (hit) {
    console.warn(`[blocklist] refused ${formKey} — matched ${hit}`)
    return list.mode === 'silent'
      // Accept and drop. Nothing is sent and nothing is recorded, so the
      // cooldown never arms and a wrongly-listed sender is not additionally
      // locked out on top of being ignored.
      ? { ok: false, status: 200, body: { ok: true } }
      : { ok: false, status: 403, body: refusedBody(id.label) }
  }

  const prior = countPriorSubmissions(formKey, id)
  if (prior >= list.repeatLimit.maxSubmissions) {
    console.warn(
      `[blocklist] repeat limit on ${formKey} — ${prior} prior submissions from ` +
      `${id.email ?? '(no email)'} / ${id.name ?? '(no name)'}`,
    )
    return list.mode === 'silent'
      ? { ok: false, status: 200, body: { ok: true } }
      : { ok: false, status: 403, body: refusedBody(id.label) }
  }

  const cooldown = checkFormCooldown(formKey, id.email ?? '')
  if (cooldown.blocked) {
    return { ok: false, status: 429, body: cooldownResponse(cooldown, id.label) }
  }

  return { ok: true }
}

/**
 * Deliberately says nothing about which rule fired, and gives a human a way
 * through. Naming the rule would tell a spammer exactly what to change; giving
 * no route at all would strand anyone caught by mistake.
 */
function refusedBody(label: string) {
  return {
    blocked: true,
    message:
      `We couldn't accept this ${label}. If you believe this is a mistake, ` +
      'please email sales@sliquid.com directly and we will pick it up from there.',
  }
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
