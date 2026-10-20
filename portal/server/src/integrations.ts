/**
 * Status collectors and connection testers for the Admin Dashboard
 * (`GET /api/admin/integrations`, `POST /api/admin/integrations/:id/test`).
 *
 * ⚠️ Legal (tier8) can read every status this module produces. Nothing it
 * returns may carry a secret, or any part of one: credentials are reported as
 * presence booleans, URLs are reduced to origin (+ path where the path is the
 * whole point, e.g. the MCP resource URI) with credentials, query and hash
 * stripped, and every outgoing string goes through `scrubSecrets()` as a final
 * net — including upstream error text, which can echo a URL back.
 *
 * Deliberately NOT reported: the Mailchimp data-centre suffix (it is literally
 * the tail of the API key) and anything from a log line we did not write.
 */
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'
import { db } from './database.js'
import { woo } from './woocommerce.js'
import {
  wp, getSetting, DEFAULT_WP_BASE_URL, DEFAULT_PRESS_CATEGORY_ID, DEFAULT_CUTOFF_DATE,
} from './wordpress.js'
import { getRelayStatus, sendTestEvent } from './ssoNotify.js'
import type { IntegrationId, IntegrationStatus, IntegrationTestResult } from './contracts.js'
import { MAILCHIMP_LIST_ID } from './routes/b2b-forms.js'

export const INTEGRATION_IDS: readonly IntegrationId[] = [
  'woocommerce', 'wordpress', 'emailjs', 'sso', 'sso_notifications', 'mcp', 's3', 'gemini', 'mailchimp',
]

export function isIntegrationId(v: string): v is IntegrationId {
  return (INTEGRATION_IDS as readonly string[]).includes(v)
}

const TEST_TIMEOUT_MS = 8000
const DEFAULT_AI_MODEL = 'imagen-4.0-generate-001'

// ─── Secret hygiene ──────────────────────────────────────────────────────────

const SECRET_ENV_VARS = [
  'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET',
  'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY',
  'SSO_CLIENT_SECRET',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'MAILCHIMP_API_KEY', 'GEMINI_API_KEY',
  'WP_APP_PASSWORD', 'JWT_SECRET',
] as const

const SECRET_SETTING_KEYS = ['wc_consumer_key', 'wc_consumer_secret'] as const

function knownSecrets(): string[] {
  const out: string[] = []
  for (const name of SECRET_ENV_VARS) {
    const v = process.env[name]?.trim()
    if (v && v.length >= 4) out.push(v)
  }
  for (const key of SECRET_SETTING_KEYS) {
    const v = getSetting(key)?.trim()
    if (v && v.length >= 4) out.push(v)
  }
  // Longest first, so a secret that contains another is removed whole.
  return out.sort((a, b) => b.length - a.length)
}

/**
 * Remove every known secret value, URL credentials, URL query strings and
 * anything shaped like a Woo key. Also caps length — an upstream error page is
 * not something the dashboard needs verbatim.
 */
export function scrubSecrets(input: string, secrets: string[] = knownSecrets()): string {
  let s = String(input)
  for (const secret of secrets) s = s.split(secret).join('[redacted]')
  s = s
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]*@/gi, '$1')           // scheme://user:pass@host
    .replace(/(\bhttps?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1')               // drop ?query / #hash
    .replace(/\b(ck|cs)_[A-Za-z0-9]{8,}\b/g, '[redacted]')              // Woo key shapes
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, 'Basic [redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
  return s.length > 300 ? `${s.slice(0, 297)}...` : s
}

/** Deep-scrub every string in a JSON-able value. The last line of defence. */
function scrubDeep<T>(value: T, secrets: string[]): T {
  if (typeof value === 'string') return scrubSecrets(value, secrets) as unknown as T
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, secrets)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, secrets)
    return out as T
  }
  return value
}

/** Origin only (scheme + host + port); credentials, path, query, hash dropped. */
export function safeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

/** Origin + path, for URLs whose path is the identifying part. */
function safeOriginAndPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return null
  }
}

function safeHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  try { return new URL(raw.trim()).host || null } catch { return null }
}

const present = (name: string): boolean => !!process.env[name]?.trim()

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

// ─── Last manual test result (in memory, per process) ────────────────────────

const lastTests = new Map<IntegrationId, { at: string; ok: boolean; message: string }>()

function sqliteNow(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** Prefer whichever of the log-derived and manual-test results is newer. */
function mergeLastResult(
  id: IntegrationId,
  fromLog: { at: string | null; result: 'ok' | 'error' | null; message: string | null },
): { lastResult: 'ok' | 'error' | null; lastMessage: string | null } {
  const t = lastTests.get(id)
  if (t && (!fromLog.at || t.at >= fromLog.at || !fromLog.result)) {
    return { lastResult: t.ok ? 'ok' : 'error', lastMessage: `Test: ${t.message}` }
  }
  return { lastResult: fromLog.result, lastMessage: fromLog.message }
}

// ─── Collectors ──────────────────────────────────────────────────────────────

type Source = IntegrationStatus['source']

function combineSources(sources: Source[]): Source {
  const set = new Set(sources.filter(s => s !== 'none'))
  if (set.size === 0) return 'none'
  if (set.size === 1) return [...set][0]
  // env/saved overriding only some defaults is still "mixed".
  return 'mixed'
}

function wooStatus(): IntegrationStatus {
  const envComplete = present('WC_URL') && present('WC_CONSUMER_KEY') && present('WC_CONSUMER_SECRET')
  const savedComplete = !!(getSetting('wc_url') && getSetting('wc_consumer_key') && getSetting('wc_consumer_secret'))
  const cfg = woo.getConfig()
  const source: Source = envComplete ? 'env' : savedComplete ? 'saved' : 'none'

  const last = db.prepare(
    'SELECT synced_at, direction, status, message FROM woo_sync_log ORDER BY id DESC LIMIT 1',
  ).get() as { synced_at: string; direction: string; status: string; message: string | null } | undefined

  return {
    id: 'woocommerce',
    name: 'WooCommerce',
    configured: !!cfg,
    source,
    details: {
      store: safeHost(cfg?.url),
      envCredentials: envComplete,
      savedCredentials: savedComplete,
      savedOverriddenByEnv: envComplete && savedComplete,
    },
    lastActivity: last?.synced_at ?? null,
    ...mergeLastResult('woocommerce', {
      at: last?.synced_at ?? null,
      result: last ? (last.status === 'ok' ? 'ok' : 'error') : null,
      message: last ? `Last ${last.direction}: ${last.status}${last.message ? ` — ${last.message}` : ''}` : null,
    }),
    testable: true,
    manage: 'dashboard',
    manageHint: 'Saved credentials are edited in the WooCommerce section below. If WC_URL, WC_CONSUMER_KEY and WC_CONSUMER_SECRET are all set in Railway, they take precedence.',
  }
}

function wordpressStatus(): IntegrationStatus {
  const cfg = wp.getConfig()

  const baseSource: Source =
    process.env.WP_BASE_URL ? 'env'
      : getSetting('wp_base_url') ? 'saved'
      : process.env.WC_URL ? 'env'
      : getSetting('wc_url') ? 'saved'
      : 'default'
  const catSource: Source =
    process.env.WP_ANNOUNCEMENTS_CATEGORY_ID ? 'env' : getSetting('wp_category_id') ? 'saved' : 'default'
  const cutSource: Source =
    process.env.WP_ANNOUNCEMENTS_CUTOFF ? 'env' : getSetting('wp_cutoff_date') ? 'saved' : 'default'

  const usingDefaults =
    cfg.baseUrl === DEFAULT_WP_BASE_URL && cfg.categoryId === DEFAULT_PRESS_CATEGORY_ID && cfg.cutoffDate === DEFAULT_CUTOFF_DATE

  const last = db.prepare(
    'SELECT synced_at, status, posts_seen, posts_created, posts_updated, message FROM announcement_sync_log ORDER BY id DESC LIMIT 1',
  ).get() as {
    synced_at: string; status: string; posts_seen: number; posts_created: number; posts_updated: number; message: string | null
  } | undefined

  return {
    id: 'wordpress',
    name: 'WordPress announcements',
    configured: wp.isConfigured(),
    source: usingDefaults && baseSource === 'default' ? 'default' : combineSources([baseSource, catSource, cutSource]),
    details: {
      baseUrl: safeOrigin(cfg.baseUrl),
      categoryId: cfg.categoryId,
      cutoffDate: cfg.cutoffDate,
      syncEnabled: wp.isSyncEnabled(),
      appPasswordConfigured: !!cfg.auth,
    },
    lastActivity: last?.synced_at ?? null,
    ...mergeLastResult('wordpress', {
      at: last?.synced_at ?? null,
      result: last ? (last.status === 'ok' ? 'ok' : 'error') : null,
      message: last
        ? last.status === 'ok'
          ? `Last sync: ${last.posts_seen} seen, ${last.posts_created} new, ${last.posts_updated} updated`
          : `Last sync failed${last.message ? ` — ${last.message}` : ''}`
        : null,
    }),
    testable: true,
    manage: 'dashboard',
    manageHint: 'Edited in the WordPress announcements section below. WP_BASE_URL, WP_ANNOUNCEMENTS_CATEGORY_ID and WP_ANNOUNCEMENTS_CUTOFF in Railway take precedence; WP_APP_USER / WP_APP_PASSWORD are env-only.',
  }
}

function emailjsStatus(): IntegrationStatus {
  const pub = present('EMAILJS_PUBLIC_KEY')
  const priv = present('EMAILJS_PRIVATE_KEY')
  const svc = present('EMAILJS_SERVICE_ID')
  return {
    id: 'emailjs',
    name: 'EmailJS',
    configured: pub && priv && svc,
    source: pub || priv || svc ? 'env' : 'none',
    details: { publicKeySet: pub, privateKeySet: priv, serviceIdSet: svc },
    lastActivity: null,
    ...mergeLastResult('emailjs', { at: null, result: null, message: null }),
    testable: false,
    manage: 'env',
    manageHint: 'Set EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY and EMAILJS_SERVICE_ID in Railway. Without them, email sending is skipped.',
  }
}

const SSO_VARS = [
  'SSO_ENABLED', 'SSO_ISSUER', 'SSO_AUTHORIZE_URL', 'SSO_TOKEN_URL', 'SSO_JWKS_URL',
  'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET', 'SSO_REDIRECT_URI',
] as const

function ssoStatus(): IntegrationStatus {
  const enabled = process.env.SSO_ENABLED === 'true'
  // Mirrors isConfigured() in routes/sso.ts (not exported).
  const configured = enabled && ['SSO_AUTHORIZE_URL', 'SSO_TOKEN_URL', 'SSO_JWKS_URL', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET', 'SSO_REDIRECT_URI']
    .every(present)
  const anySet = SSO_VARS.some(present)

  const last = db.prepare(
    'SELECT MAX(last_login) AS at FROM users WHERE sso_sub IS NOT NULL',
  ).get() as { at: string | null } | undefined

  return {
    id: 'sso',
    name: 'Employee SSO',
    configured,
    source: anySet ? 'env' : 'none',
    details: {
      enabled,
      issuer: safeOrigin(process.env.SSO_ISSUER),
      clientIdSet: present('SSO_CLIENT_ID'),
      clientSecretSet: present('SSO_CLIENT_SECRET'),
      authorizeUrlSet: present('SSO_AUTHORIZE_URL'),
      tokenUrlSet: present('SSO_TOKEN_URL'),
      jwksUrlSet: present('SSO_JWKS_URL'),
      redirectUri: safeOriginAndPath(process.env.SSO_REDIRECT_URI),
    },
    lastActivity: last?.at ?? null,
    ...mergeLastResult('sso', { at: null, result: null, message: null }),
    testable: present('SSO_ISSUER'),
    manage: 'env',
    manageHint: `Set ${SSO_VARS.join(', ')} (and optionally SSO_SCOPE, SSO_SUCCESS_REDIRECT) in Railway.`,
  }
}

function ssoNotificationsStatus(): IntegrationStatus {
  const r = getRelayStatus()
  return {
    id: 'sso_notifications',
    name: 'SSO notifications relay',
    configured: r.configured,
    source: r.configured ? 'mixed' : 'none',
    details: {
      enabled: r.enabled,
      url: safeOriginAndPath(r.url),
      pending: r.pending,
      failing: r.failing,
    },
    lastActivity: r.lastDeliveredAt,
    ...mergeLastResult('sso_notifications', {
      at: r.lastDeliveredAt,
      result: r.failing > 0 || (r.lastError && !r.lastDeliveredAt) ? 'error' : r.lastDeliveredAt ? 'ok' : null,
      message: r.lastError ? `Last error: ${r.lastError}` : null,
    }),
    testable: r.configured,
    manage: 'dashboard',
    manageHint: 'Enable and route events in the SSO notifications section below. The URL and client credentials come from SSO_NOTIFICATIONS_URL, SSO_CLIENT_ID and SSO_CLIENT_SECRET in Railway.',
  }
}

function mcpStatus(): IntegrationStatus {
  const resource = (process.env.MCP_RESOURCE_URI ?? '').trim()
  const authMode = (process.env.MCP_AUTH_MODE ?? '').trim().toLowerCase() === 'none' ? 'none' : 'oauth'
  const issuerSet = present('SSO_ISSUER')
  const jwksSet = present('SSO_JWKS_URL')
  const configured = authMode === 'none' ? !!resource : !!resource && issuerSet && jwksSet
  return {
    id: 'mcp',
    name: 'ChatGPT asset server (MCP)',
    configured,
    source: resource || present('MCP_AUTH_MODE') || present('MCP_SCOPES_SUPPORTED') ? 'env' : 'none',
    details: {
      resourceUri: safeOriginAndPath(resource),
      issuer: safeOrigin(process.env.SSO_ISSUER),
      jwksUrlSet: jwksSet,
      authMode,
      scopes: (process.env.MCP_SCOPES_SUPPORTED ?? 'openid assets:read').trim(),
    },
    lastActivity: null,
    ...mergeLastResult('mcp', { at: null, result: null, message: null }),
    testable: false,
    manage: 'env',
    manageHint: 'Set MCP_RESOURCE_URI (plus SSO_ISSUER and SSO_JWKS_URL) in Railway; MCP_AUTH_MODE and MCP_SCOPES_SUPPORTED are optional.',
  }
}

function s3Status(): IntegrationStatus {
  const bucket = process.env.S3_BUCKET?.trim() || null
  const keyId = present('AWS_ACCESS_KEY_ID')
  const secret = present('AWS_SECRET_ACCESS_KEY')
  return {
    id: 's3',
    name: 'AWS S3',
    configured: !!bucket && keyId && secret,
    source: bucket || keyId || secret || present('AWS_REGION') ? 'env' : 'none',
    details: {
      bucket,
      region: process.env.AWS_REGION?.trim() || 'us-east-1',
      accessKeyIdSet: keyId,
      secretAccessKeySet: secret,
      publicReadFallback: (process.env.MCP_S3_PUBLIC_FALLBACK ?? '').trim().toLowerCase() !== 'off',
    },
    lastActivity: null,
    ...mergeLastResult('s3', { at: null, result: null, message: null }),
    testable: !!bucket && keyId && secret,
    manage: 'env',
    manageHint: 'Set S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Railway.',
  }
}

function geminiStatus(): IntegrationStatus {
  const keySet = present('GEMINI_API_KEY')
  const savedModel = getSetting('ai_model')
  return {
    id: 'gemini',
    name: 'Gemini / Imagen',
    configured: keySet,
    source: keySet && savedModel ? 'mixed' : keySet ? 'env' : 'none',
    details: {
      apiKeySet: keySet,
      creatorModel: savedModel || DEFAULT_AI_MODEL,
      creatorModelSaved: !!savedModel,
    },
    lastActivity: null,
    ...mergeLastResult('gemini', { at: null, result: null, message: null }),
    testable: false,
    manage: 'env',
    manageHint: 'Set GEMINI_API_KEY in Railway. The image model is chosen in the AI image model section below.',
  }
}

function mailchimpStatus(): IntegrationStatus {
  const keySet = present('MAILCHIMP_API_KEY')
  return {
    id: 'mailchimp',
    name: 'Mailchimp',
    configured: keySet,
    source: keySet ? 'env' : 'none',
    // The data-centre suffix is part of the key, so it is not reported.
    details: { apiKeySet: keySet, listId: MAILCHIMP_LIST_ID },
    lastActivity: null,
    ...mergeLastResult('mailchimp', { at: null, result: null, message: null }),
    testable: keySet,
    manage: 'env',
    manageHint: 'Set MAILCHIMP_API_KEY in Railway. Used by the Erospain booth sign-up form.',
  }
}

const COLLECTORS: Record<IntegrationId, () => IntegrationStatus> = {
  woocommerce: wooStatus,
  wordpress: wordpressStatus,
  emailjs: emailjsStatus,
  sso: ssoStatus,
  sso_notifications: ssoNotificationsStatus,
  mcp: mcpStatus,
  s3: s3Status,
  gemini: geminiStatus,
  mailchimp: mailchimpStatus,
}

/** One collector failing must not blank the whole dashboard. */
export function collectIntegrations(): IntegrationStatus[] {
  const secrets = knownSecrets()
  return INTEGRATION_IDS.map(id => {
    try {
      return scrubDeep(COLLECTORS[id](), secrets)
    } catch (err: any) {
      console.error(`[integrations] status for ${id} failed:`, err?.name ?? 'Error')
      return {
        id,
        name: id,
        configured: false,
        source: 'none',
        details: {},
        lastActivity: null,
        lastResult: 'error',
        lastMessage: scrubSecrets(`Could not read status: ${err?.message ?? 'unknown error'}`, secrets),
        testable: false,
        manage: 'env',
        manageHint: null,
      } satisfies IntegrationStatus
    }
  })
}

// ─── Testers ─────────────────────────────────────────────────────────────────

async function testWoo(): Promise<IntegrationTestResult> {
  const cfg = woo.getConfig()
  if (!cfg) return { ok: false, message: 'WooCommerce is not configured.' }
  const r = await withTimeout(woo.testConnection(), TEST_TIMEOUT_MS, 'WooCommerce')
  return r.ok
    ? { ok: true, message: `Connected to ${safeHost(cfg.url) ?? 'the store'}.` }
    : { ok: false, message: r.error ?? 'Connection failed' }
}

async function testWordPress(): Promise<IntegrationTestResult> {
  const cfg = wp.getConfig()
  const r = await withTimeout(wp.testConnection(), TEST_TIMEOUT_MS, 'WordPress')
  return r.ok
    ? { ok: true, message: `Reached ${safeHost(cfg.baseUrl) ?? 'WordPress'}: ${r.total ?? 0} published post(s) in category ${cfg.categoryId}.` }
    : { ok: false, message: r.error ?? 'Connection failed' }
}

async function testSso(): Promise<IntegrationTestResult> {
  const issuer = (process.env.SSO_ISSUER ?? '').trim().replace(/\/+$/, '')
  if (!issuer || !safeOrigin(issuer)) return { ok: false, message: 'SSO_ISSUER is not set to a valid URL.' }
  let res: Response
  try {
    res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
  } catch (err: any) {
    return {
      ok: false,
      message: err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? `Discovery document timed out after ${TEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach ${safeOrigin(issuer)}.`,
    }
  }
  if (!res.ok) return { ok: false, message: `Discovery document returned HTTP ${res.status}.` }
  let doc: { issuer?: unknown; jwks_uri?: unknown }
  try { doc = await res.json() as typeof doc } catch {
    return { ok: false, message: 'Discovery document is not valid JSON.' }
  }
  const got = typeof doc.issuer === 'string' ? doc.issuer.replace(/\/+$/, '') : null
  if (got !== issuer) {
    return { ok: false, message: `Issuer mismatch: the IdP reports ${safeOrigin(got) ?? 'no issuer'}, SSO_ISSUER is ${safeOrigin(issuer)}.` }
  }
  return { ok: true, message: `Discovery document OK; issuer matches ${safeOrigin(issuer)}.` }
}

async function testS3(): Promise<IntegrationTestResult> {
  const bucket = process.env.S3_BUCKET?.trim()
  if (!bucket || !present('AWS_ACCESS_KEY_ID') || !present('AWS_SECRET_ACCESS_KEY')) {
    return { ok: false, message: 'S3 is not configured (S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).' }
  }
  const client = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
  try {
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), TEST_TIMEOUT_MS, 'S3')
    return { ok: true, message: `Bucket ${bucket} is reachable with these credentials.` }
  } catch (err: any) {
    // AWS error messages can quote request details; report name + status only.
    const status = err?.$metadata?.httpStatusCode
    const name = typeof err?.name === 'string' ? err.name : 'Error'
    return { ok: false, message: `HeadBucket failed: ${name}${status ? ` (HTTP ${status})` : ''}.` }
  } finally {
    client.destroy()
  }
}

async function testMailchimp(): Promise<IntegrationTestResult> {
  const key = process.env.MAILCHIMP_API_KEY?.trim()
  if (!key) return { ok: false, message: 'MAILCHIMP_API_KEY is not set.' }
  const dc = key.includes('-') ? key.split('-').pop() : null
  if (!dc || !/^[a-z0-9]+$/i.test(dc)) return { ok: false, message: 'MAILCHIMP_API_KEY is not in the expected <key>-<dc> format.' }
  try {
    const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      headers: { Authorization: `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      return {
        ok: false,
        message: res.status === 401 ? 'Mailchimp rejected the API key (HTTP 401).' : `Mailchimp returned HTTP ${res.status}.`,
      }
    }
    return { ok: true, message: 'Mailchimp API key accepted.' }
  } catch (err: any) {
    // Never echo the error: it can contain the data-centre host, i.e. part of the key.
    return {
      ok: false,
      message: err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? `Mailchimp timed out after ${TEST_TIMEOUT_MS / 1000}s.`
        : 'Could not reach Mailchimp.',
    }
  }
}

function configOnly(id: IntegrationId): IntegrationTestResult {
  const s = COLLECTORS[id]()
  return s.configured
    ? { ok: true, message: `${s.name} is configured. No live test is performed for this connection.` }
    : { ok: false, message: `${s.name} is not configured. No live test is performed for this connection.` }
}

const TESTERS: Record<IntegrationId, () => Promise<IntegrationTestResult> | IntegrationTestResult> = {
  woocommerce: testWoo,
  wordpress: testWordPress,
  sso: testSso,
  sso_notifications: () => sendTestEvent(),
  s3: testS3,
  mailchimp: testMailchimp,
  emailjs: () => configOnly('emailjs'),
  gemini: () => configOnly('gemini'),
  mcp: () => configOnly('mcp'),
}

/** Never throws; the result is always scrubbed. */
export async function testIntegration(id: IntegrationId): Promise<IntegrationTestResult> {
  let result: IntegrationTestResult
  try {
    const r = await TESTERS[id]()
    result = { ok: !!r.ok, message: String(r.message ?? (r.ok ? 'OK' : 'Failed')) }
  } catch (err: any) {
    result = { ok: false, message: err?.message ?? 'Test failed' }
  }
  result.message = scrubSecrets(result.message)
  lastTests.set(id, { at: sqliteNow(), ok: result.ok, message: result.message })
  return result
}

/** Tests only. */
export function _resetIntegrationTestResults(): void {
  lastTests.clear()
}
