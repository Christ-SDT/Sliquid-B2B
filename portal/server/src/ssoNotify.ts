/**
 * SSO notification relay — forwards selected admin notifications to the Sliquid
 * SSO portal, routed by notification type to SSO roles.
 *
 * Contract (fixed, shared with the SSO repo):
 *   POST {url}  HTTP Basic SSO_CLIENT_ID:SSO_CLIENT_SECRET  body SsoNotificationPayload
 *   2xx (202 accepted / 200 duplicate event_id) → delivered
 *   400 → schema error, permanent: recorded and never retried automatically
 *   401/403 → config problem: row kept, backed off to the max, error surfaced
 *   429 / 5xx / network / anything else → retried with exponential backoff
 *
 * Shape of the pipeline:
 *   notifyAdmins() → enqueueSsoNotification() — ONE local INSERT, no network in
 *   the request path, and never throws into the caller.
 *   index.ts interval → drainNotificationOutbox() — the only place that talks
 *   to the SSO portal (besides the manual test event).
 *
 * ⚠️ The client secret must never reach a response body, a log line or the
 * outbox's last_error. Every error string built here goes through scrub().
 */
import { randomUUID } from 'crypto'
import { db } from './database.js'
import { SSO_ROLES } from './contracts.js'
import type { IntegrationTestResult, SsoNotificationPayload, SsoNotifySettings, SsoOutboxRow } from './contracts.js'

// ─── Settings ────────────────────────────────────────────────────────────────

const KEY_ENABLED = 'sso_notify_enabled'
const KEY_ROUTING = 'sso_notify_routing'

/** Relayable event types, in display order, with their English admin labels. */
export const SSO_EVENT_TYPES: ReadonlyArray<{ type: string; label: string }> = [
  { type: 'new_registration', label: 'New partner registration' },
  { type: 'reward_claim', label: 'Certification reward claim' },
  { type: 'reward_order_failed', label: 'Reward order push failed' },
  { type: 'marketing_request', label: 'Marketing request' },
  { type: 'cert_issued', label: 'Certificate issued' },
  { type: 'low_stock', label: 'Low stock' },
  { type: 'out_of_stock', label: 'Out of stock' },
  { type: 'announcement_review', label: 'Press release awaiting review' },
]

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(SSO_EVENT_TYPES.map(e => e.type))
const SSO_ROLE_SET: ReadonlySet<string> = new Set(SSO_ROLES)

export const DEFAULT_SSO_ROUTING: Readonly<Record<string, readonly string[]>> = {
  new_registration: ['sliquid_super_admin', 'sliquid_owner', 'sliquid_development', 'sliquid_sales'],
  reward_claim: ['sliquid_sales', 'sliquid_warehouse_manager'],
  reward_order_failed: ['sliquid_sales', 'sliquid_warehouse_manager', 'sliquid_development'],
  marketing_request: ['sliquid_marketing', 'sliquid_sales'],
  cert_issued: ['sliquid_sales'],
  low_stock: ['sliquid_warehouse_manager'],
  out_of_stock: ['sliquid_warehouse_manager'],
  announcement_review: ['sliquid_marketing'],
}

function readSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM woo_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function writeSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)').run(key, value)
}

export function isRelayEnabled(): boolean {
  return readSetting(KEY_ENABLED) === '1'
}

/** Known role values only, de-duplicated, in SSO_ROLES order. */
function cleanRoles(roles: readonly string[]): string[] {
  const wanted = new Set(roles)
  return SSO_ROLES.filter(r => wanted.has(r))
}

/**
 * The effective routing: every known event type → its roles. Falls back to the
 * defaults when nothing (or something malformed) is stored. Once an admin has
 * saved routing, a type missing from the stored map routes to nobody.
 */
export function getSsoRouting(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  let stored: Record<string, unknown> | null = null
  const raw = readSetting(KEY_ROUTING)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed
    } catch { stored = null }
  }
  for (const { type } of SSO_EVENT_TYPES) {
    if (stored) {
      const v = stored[type]
      out[type] = Array.isArray(v) ? cleanRoles(v.filter((x): x is string => typeof x === 'string')) : []
    } else {
      out[type] = cleanRoles(DEFAULT_SSO_ROUTING[type])
    }
  }
  return out
}

export class SsoSettingsError extends Error {}

/**
 * Partial update. `routing` replaces the listed types and keeps the others.
 * Throws SsoSettingsError (→ 400) on an unknown type, a non-array, or a role
 * outside SSO_ROLES — nothing is stored in that case.
 */
export function setSsoNotifySettings(input: { enabled?: unknown; routing?: unknown }): void {
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new SsoSettingsError('enabled must be a boolean')
  }
  let nextRouting: Record<string, string[]> | null = null
  if (input.routing !== undefined) {
    const r = input.routing
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new SsoSettingsError('routing must be an object of type → roles')
    nextRouting = getSsoRouting()
    for (const [type, roles] of Object.entries(r as Record<string, unknown>)) {
      if (!EVENT_TYPE_SET.has(type)) throw new SsoSettingsError(`Unknown event type: ${type.slice(0, 60)}`)
      if (!Array.isArray(roles)) throw new SsoSettingsError(`Roles for ${type} must be an array`)
      for (const role of roles) {
        if (typeof role !== 'string' || !SSO_ROLE_SET.has(role)) {
          throw new SsoSettingsError(`Unknown SSO role for ${type}: ${String(role).slice(0, 60)}`)
        }
      }
      nextRouting[type] = cleanRoles(roles as string[])
    }
  }
  const tx = db.transaction(() => {
    if (input.enabled !== undefined) writeSetting(KEY_ENABLED, input.enabled ? '1' : '0')
    if (nextRouting) writeSetting(KEY_ROUTING, JSON.stringify(nextRouting))
  })
  tx()
}

// ─── Config (env, read at call time) ─────────────────────────────────────────

interface SsoConfig {
  url: string | null
  clientId: string
  clientSecret: string
  configured: boolean
  /** Env var NAMES only — never values. */
  missing: string[]
}

function getConfig(): SsoConfig {
  const explicit = (process.env.SSO_NOTIFICATIONS_URL ?? '').trim()
  const issuer = (process.env.SSO_ISSUER ?? '').trim().replace(/\/+$/, '')
  const url = explicit || (issuer ? `${issuer}/integrations/notifications` : '') || null
  const clientId = process.env.SSO_CLIENT_ID ?? ''
  const clientSecret = process.env.SSO_CLIENT_SECRET ?? ''
  const missing: string[] = []
  if (!url) missing.push('SSO_NOTIFICATIONS_URL or SSO_ISSUER')
  if (!clientId) missing.push('SSO_CLIENT_ID')
  if (!clientSecret) missing.push('SSO_CLIENT_SECRET')
  return { url, clientId, clientSecret, configured: missing.length === 0, missing }
}

/** origin + path only: no query string, no userinfo. */
function displayUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

function portalBase(): string {
  return (process.env.PORTAL_URL || 'https://sliquid-portal.pages.dev').replace(/\/+$/, '')
}

export function absoluteLink(link: string | null | undefined): string | null {
  if (!link) return null
  if (/^https?:\/\//i.test(link)) return link
  return portalBase() + (link.startsWith('/') ? link : `/${link}`)
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * Called from notifyAdmins() after the portal rows are written. A single
 * INSERT; never throws, never touches the network.
 */
export function enqueueSsoNotification(type: string, title: string, message: string, link?: string | null): void {
  try {
    if (!isRelayEnabled()) return
    const roles = getSsoRouting()[type]
    if (!roles || roles.length === 0) return
    const payload: SsoNotificationPayload = {
      event_id: randomUUID(),
      type,
      title,
      message,
      link: absoluteLink(link),
      audience_roles: roles,
      occurred_at: new Date().toISOString(),
    }
    db.prepare('INSERT INTO notification_outbox (event_id, type, payload) VALUES (?, ?, ?)')
      .run(payload.event_id, type, JSON.stringify(payload))
  } catch (err) {
    console.error('[sso-notify] enqueue failed:', err instanceof Error ? err.message : 'unknown error')
  }
}

// ─── Delivery ────────────────────────────────────────────────────────────────

/** next_attempt_at for a row that must not be retried automatically. */
const STOPPED_AT = '9999-12-31 23:59:59'
const BATCH_SIZE = 25
const BASE_DELAY_S = 60
const MAX_DELAY_S = 6 * 60 * 60
const GIVE_UP_DAYS = 7
const TIMEOUT_MS = 10_000

type Outcome =
  | { kind: 'delivered'; status: number }
  | { kind: 'permanent'; status: number; error: string }
  | { kind: 'auth'; status: number; error: string }
  | { kind: 'retry'; status: number | null; error: string }

function basicAuth(cfg: SsoConfig): string {
  return 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
}

/** Remove anything credential-shaped from text bound for storage or a response. */
function scrub(text: string, cfg: SsoConfig): string {
  let out = text
  const secrets = [cfg.clientSecret, basicAuth(cfg).slice(6)].filter(s => s && s.length >= 4)
  for (const s of secrets) out = out.split(s).join('[redacted]')
  out = out.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [redacted]')
  return out.replace(/\s+/g, ' ').trim().slice(0, 160)
}

async function shortReason(res: Response): Promise<string> {
  try {
    const text = await res.text()
    if (!text) return res.statusText || ''
    try {
      const j = JSON.parse(text)
      const m = j?.message ?? j?.error ?? j?.code
      if (typeof m === 'string') return m
    } catch { /* not JSON */ }
    return text.slice(0, 120)
  } catch {
    return res.statusText || ''
  }
}

async function post(cfg: SsoConfig, payload: SsoNotificationPayload): Promise<Outcome> {
  let res: Response
  try {
    res = await fetch(cfg.url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basicAuth(cfg) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const name = (err as { name?: string })?.name
    const error = name === 'TimeoutError' || name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS / 1000}s`
      : `network error: ${scrub(err instanceof Error ? err.message : String(err), cfg)}`
    return { kind: 'retry', status: null, error }
  }
  const status = res.status
  if (status >= 200 && status < 300) return { kind: 'delivered', status }
  const reason = scrub(await shortReason(res), cfg)
  const label = `HTTP ${status}${reason ? `: ${reason}` : ''}`
  if (status === 400) return { kind: 'permanent', status, error: `${label} (rejected, not retried)` }
  if (status === 401 || status === 403) {
    const hint = status === 401
      ? 'check SSO_CLIENT_ID / SSO_CLIENT_SECRET'
      : 'this client may not be enabled to post notifications in the SSO portal'
    return { kind: 'auth', status, error: `${label} (${hint})` }
  }
  return { kind: 'retry', status, error: label }
}

function backoffSeconds(attemptsBefore: number): number {
  return Math.min(BASE_DELAY_S * 2 ** Math.min(attemptsBefore, 20), MAX_DELAY_S)
}

let draining = false

/** Deliver due outbox rows to the SSO portal. Returns rows delivered. */
export async function drainNotificationOutbox(): Promise<number> {
  if (draining) return 0
  if (!isRelayEnabled()) return 0
  const cfg = getConfig()
  if (!cfg.configured) return 0

  draining = true
  let delivered = 0
  try {
    const rows = db.prepare(`
      SELECT id, payload, attempts,
             (created_at <= datetime('now', '-${GIVE_UP_DAYS} days')) AS expired
        FROM notification_outbox
       WHERE delivered_at IS NULL AND next_attempt_at <= datetime('now')
       ORDER BY id
       LIMIT ${BATCH_SIZE}
    `).all() as { id: number; payload: string; attempts: number; expired: number }[]

    const markDelivered = db.prepare(
      "UPDATE notification_outbox SET delivered_at = datetime('now'), attempts = attempts + 1, last_error = NULL WHERE id = ?"
    )
    const markStopped = db.prepare(
      'UPDATE notification_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?'
    )
    const markRetry = db.prepare(
      "UPDATE notification_outbox SET attempts = attempts + 1, next_attempt_at = datetime('now', ?), last_error = ? WHERE id = ?"
    )

    for (const row of rows) {
      let payload: SsoNotificationPayload
      try {
        payload = JSON.parse(row.payload)
      } catch {
        markStopped.run(STOPPED_AT, 'unreadable payload (not retried)', row.id)
        continue
      }

      const outcome = await post(cfg, payload)
      if (outcome.kind === 'delivered') {
        markDelivered.run(row.id)
        delivered++
        continue
      }
      if (outcome.kind === 'permanent') {
        markStopped.run(STOPPED_AT, outcome.error, row.id)
        continue
      }
      if (row.expired) {
        markStopped.run(STOPPED_AT, `gave up after ${GIVE_UP_DAYS} days (last: ${outcome.error})`.slice(0, 240), row.id)
      } else {
        const delay = outcome.kind === 'auth' ? MAX_DELAY_S : backoffSeconds(row.attempts)
        markRetry.run(`+${delay} seconds`, outcome.error, row.id)
      }
      // Auth, rate-limit, server and network failures are not specific to this
      // row — stop the batch rather than hammering an unhealthy endpoint. The
      // rest stay due and go out on the next drain.
      break
    }
  } catch (err) {
    console.error('[sso-notify] drain failed:', err instanceof Error ? scrub(err.message, cfg) : 'unknown error')
  } finally {
    draining = false
  }
  return delivered
}

// ─── Status / settings / test ────────────────────────────────────────────────

function counts(): { pending: number; delivered: number; failing: number } {
  const r = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN delivered_at IS NULL AND last_error IS NULL THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS delivered,
      COALESCE(SUM(CASE WHEN delivered_at IS NULL AND last_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS failing
    FROM notification_outbox
  `).get() as { pending: number; delivered: number; failing: number }
  return r
}

/** For the Admin Dashboard connections card. */
export function getRelayStatus(): {
  configured: boolean
  enabled: boolean
  url: string | null
  lastDeliveredAt: string | null
  lastError: string | null
  pending: number
  failing: number
} {
  const cfg = getConfig()
  const c = counts()
  const last = db.prepare('SELECT MAX(delivered_at) AS at FROM notification_outbox').get() as { at: string | null }
  const err = db.prepare(
    'SELECT last_error FROM notification_outbox WHERE delivered_at IS NULL AND last_error IS NOT NULL ORDER BY id DESC LIMIT 1'
  ).get() as { last_error: string } | undefined
  return {
    configured: cfg.configured,
    enabled: isRelayEnabled(),
    url: displayUrl(cfg.url),
    lastDeliveredAt: last?.at ?? null,
    lastError: err?.last_error ?? null,
    pending: c.pending,
    failing: c.failing,
  }
}

export function getSsoNotifySettings(): SsoNotifySettings {
  const cfg = getConfig()
  const rows = db.prepare(`
    SELECT id, event_id, type, payload, attempts, next_attempt_at, delivered_at, last_error, created_at
      FROM notification_outbox ORDER BY id DESC LIMIT 25
  `).all() as (Omit<SsoOutboxRow, 'title'> & { payload: string })[]
  const recent: SsoOutboxRow[] = rows.map(({ payload, ...r }) => {
    let title = ''
    try { title = String(JSON.parse(payload)?.title ?? '') } catch { title = '' }
    return { ...r, title }
  })
  return {
    enabled: isRelayEnabled(),
    configured: cfg.configured,
    missing: cfg.missing,
    url: displayUrl(cfg.url),
    routing: getSsoRouting(),
    eventTypes: SSO_EVENT_TYPES.map(e => ({ ...e })),
    ssoRoles: [...SSO_ROLES],
    counts: counts(),
    recent,
  }
}

/** Make one undelivered row due now. False when it is missing or delivered. */
export function retryOutboxRow(id: number): boolean {
  const r = db.prepare(
    "UPDATE notification_outbox SET next_attempt_at = datetime('now') WHERE id = ? AND delivered_at IS NULL"
  ).run(id)
  return r.changes > 0
}

/** Send one synthetic event straight to the SSO intake (not via the outbox). */
export async function sendTestEvent(): Promise<IntegrationTestResult> {
  const cfg = getConfig()
  if (!cfg.configured) {
    return { ok: false, message: `Not configured: missing ${cfg.missing.join(', ')}` }
  }
  const routed = getSsoRouting().new_registration
  const payload: SsoNotificationPayload = {
    event_id: randomUUID(),
    type: 'portal_test',
    title: 'Test notification from the partner portal',
    message: 'If you can see this in the SSO portal, the partner portal notification relay is working.',
    link: absoluteLink('/admin/dashboard'),
    audience_roles: routed.length ? routed : ['sliquid_super_admin'],
    occurred_at: new Date().toISOString(),
  }
  const outcome = await post(cfg, payload)
  switch (outcome.kind) {
    case 'delivered':
      return { ok: true, message: outcome.status === 200 ? 'Accepted (HTTP 200, duplicate event)' : `Delivered (HTTP ${outcome.status})` }
    default:
      return { ok: false, message: outcome.error }
  }
}
