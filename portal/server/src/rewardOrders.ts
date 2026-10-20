/**
 * Certification reward claim (cert_rewards row) → a free $0 WooCommerce order.
 *
 * Lifecycle of the one reward_orders row per claim:
 *
 *   (none) ──draft──▶ draft ──push──▶ pushing ──▶ pushed ──trash──▶ deleted
 *                      ▲  │                  └──▶ failed ──push──▶ pushing …
 *                      └──┘ rebuild (draft / failed / deleted only)
 *
 * ⚠️ setRewardFulfilled() is the ONLY writer of cert_rewards.fulfilled /
 * fulfilled_at. Marketing Requests, User Management and the Woo status rule
 * below all go through it, so the three can never disagree.
 *
 * ⚠️ Pushing is idempotent twice over: the draft|failed → 'pushing' flip is a
 * single SQLite transaction (a second push gets 409), and before creating an
 * order we look in Woo for one already carrying `_sliquid_reward_id` — so a
 * crash or timeout between Woo creating the order and us saving its id adopts
 * that order on the retry instead of shipping a second box.
 */
import { db } from './database.js'
import { woo, WooError, type WooOrder } from './woocommerce.js'
import { getRewardItemSettings } from './rewardItemSettings.js'
import { deriveRewardProducts } from './rewardOptions.js'
import { notifyAdmins } from './notifications.js'
import { preferredLanguageOf } from './languages.js'
import { sendRewardOrderUpdateEmail } from './email.js'
import type {
  RewardOrder, RewardOrderDetail, RewardOrderEvent, RewardOrderLine, RewardOrderLineKind,
  RewardOrderPatch, RewardOrderShipping, RewardOrderState, RewardOrderSummary, RewardRequest,
} from './contracts.js'

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Carries the HTTP status the route should answer with. Messages are safe to show. */
export class RewardOrderError extends Error {
  readonly status: number
  readonly issues?: string[]
  constructor(status: number, message: string, issues?: string[]) {
    super(message)
    this.name = 'RewardOrderError'
    this.status = status
    this.issues = issues
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const LINE_KINDS: readonly RewardOrderLineKind[] = ['product', 'shirt', 'pin']
const SHIPPING_KEYS: readonly (keyof RewardOrderShipping)[] = [
  'first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'state', 'postcode', 'country',
]
const REQUIRED_SHIPPING: readonly (keyof RewardOrderShipping)[] = ['first_name', 'address_1', 'city', 'state', 'postcode']
const SHIPPING_LABEL: Record<keyof RewardOrderShipping, string> = {
  first_name: 'first name', last_name: 'last name', company: 'company', address_1: 'street address',
  address_2: 'apartment / suite', city: 'city', state: 'state', postcode: 'ZIP code', country: 'country',
}
/** Woo statuses after which nothing changes on its own — the sync stops polling them. */
export const FINAL_WOO_STATUSES = ['completed', 'cancelled', 'refunded', 'failed'] as const
/** A 'pushing' row this old was orphaned by a crash/restart mid-push and may be retried. */
const STALE_PUSHING_MINUTES = 5

export const ISSUE_PRODUCT_UNMATCHED = 'Choose the product — the claimed label matches no single SKU'
export const ISSUE_WOO_UNREACHABLE = 'WooCommerce unreachable — retry'
export const ISSUE_WOO_NOT_CONFIGURED = 'WooCommerce is not configured'
const ISSUE_SHIRT_UNMAPPED = 'Map the reward T-shirt to a WooCommerce product (Admin Dashboard)'
const ISSUE_PIN_UNMAPPED = 'Map the reward pin to a WooCommerce product (Admin Dashboard)'
const ISSUE_NEEDS_PRODUCT = 'Choose the WooCommerce product'
const ISSUE_NEEDS_VARIATION = 'Choose the shirt size variation'
const ISSUE_QUANTITY = 'Quantity must be a whole number of at least 1'

const KIND_LABEL: Record<RewardOrderLineKind, string> = { product: 'Product', shirt: 'T-shirt', pin: 'Pin' }

// ─── Row types ────────────────────────────────────────────────────────────────

interface OrderRow {
  id: number
  cert_reward_id: number
  state: RewardOrderState
  lines: string
  shipping: string
  customer_note: string | null
  woo_order_id: number | null
  woo_order_number: string | null
  woo_status: string | null
  last_error: string | null
  created_by: number | null
  pushed_by: number | null
  pushed_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

interface ClaimRow {
  id: number
  user_id: number
  full_name: string
  product: string
  product_sku: string | null
  shirt_size: string
  address1: string
  address2: string | null
  city: string
  state: string
  zip: string
  submitted_at: string
  fulfilled: number | null
  fulfilled_at: string | null
  email: string
  company: string | null
  certificate_number: string | null
  avg_score: number | null
}

// ─── Reads ────────────────────────────────────────────────────────────────────

function getClaim(rewardId: number): ClaimRow | undefined {
  return db.prepare(`
    SELECT cr.id, cr.user_id, cr.full_name, cr.product, cr.product_sku, cr.shirt_size,
           cr.address1, cr.address2, cr.city, cr.state, cr.zip, cr.submitted_at,
           cr.fulfilled, cr.fulfilled_at,
           u.email, u.company,
           (SELECT c.certificate_number FROM certificates c
             WHERE c.user_id = cr.user_id AND c.is_valid = 1 ORDER BY c.id DESC LIMIT 1) AS certificate_number,
           (SELECT ROUND(AVG(qr.score)) FROM quiz_results qr
             WHERE qr.user_id = cr.user_id AND qr.passed = 1) AS avg_score
    FROM cert_rewards cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.id = ?
  `).get(rewardId) as ClaimRow | undefined
}

function requireClaim(rewardId: number): ClaimRow {
  const claim = getClaim(rewardId)
  if (!claim) throw new RewardOrderError(404, 'Reward claim not found')
  return claim
}

function getOrderRow(rewardId: number): OrderRow | undefined {
  return db.prepare('SELECT * FROM reward_orders WHERE cert_reward_id = ?').get(rewardId) as OrderRow | undefined
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback
  try { return JSON.parse(text) as T } catch { return fallback }
}

function emptyShipping(): RewardOrderShipping {
  return { first_name: '', last_name: '', company: '', address_1: '', address_2: '', city: '', state: '', postcode: '', country: 'US' }
}

function parseLines(row: OrderRow): RewardOrderLine[] {
  const raw = parseJson<unknown>(row.lines, [])
  return Array.isArray(raw) ? (raw as RewardOrderLine[]) : []
}

function parseShipping(row: OrderRow): RewardOrderShipping {
  const raw = parseJson<Partial<RewardOrderShipping>>(row.shipping, {})
  const out = emptyShipping()
  for (const k of SHIPPING_KEYS) {
    const v = raw?.[k]
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/** Every blocking problem for a push. Empty ⇔ the order may be pushed. */
export function computeIssues(order: Pick<RewardOrder, 'state' | 'lines' | 'shipping'>): string[] {
  const issues: string[] = []
  if (order.state === 'pushing') issues.push('A push to WooCommerce is already in progress')
  if (order.state === 'pushed') issues.push('Already pushed to WooCommerce')
  if (order.state === 'deleted') issues.push('This order was deleted — rebuild the draft to start again')

  if (order.lines.length === 0) issues.push('Add at least one line item')
  for (const line of order.lines) {
    const label = KIND_LABEL[line.kind] ?? 'Line'
    const own = lineIssue(line, line.issue)
    if (own) issues.push(`${label}: ${own}`)
  }
  for (const key of REQUIRED_SHIPPING) {
    if (!order.shipping[key]?.trim()) issues.push(`Shipping ${SHIPPING_LABEL[key]} is required`)
  }
  return issues
}

/**
 * The line's own blocking issue, or null when resolved. A resolved line drops
 * any stale issue; an unresolved one keeps the specific reason it was given
 * (e.g. "WooCommerce unreachable — retry") or gets a generic one.
 */
function lineIssue(line: RewardOrderLine, given: string | null | undefined): string | null {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) return ISSUE_QUANTITY
  if (!line.woo_product_id) return given?.trim() ? given.trim() : ISSUE_NEEDS_PRODUCT
  if (line.kind === 'shirt' && !line.woo_variation_id) {
    return given?.trim() && given !== ISSUE_NEEDS_PRODUCT ? given.trim() : ISSUE_NEEDS_VARIATION
  }
  return null
}

function serialize(row: OrderRow): RewardOrder {
  const lines = parseLines(row).map(l => ({ ...l, issue: lineIssue(l, l.issue) }))
  const shipping = parseShipping(row)
  return {
    id: row.id,
    cert_reward_id: row.cert_reward_id,
    state: row.state,
    lines,
    shipping,
    customer_note: row.customer_note,
    woo_order_id: row.woo_order_id,
    woo_order_number: row.woo_order_number,
    woo_status: row.woo_status,
    woo_admin_url: row.woo_order_id ? woo.adminOrderUrl(row.woo_order_id) : null,
    last_error: row.last_error,
    created_by: row.created_by,
    pushed_by: row.pushed_by,
    pushed_at: row.pushed_at,
    last_synced_at: row.last_synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    issues: computeIssues({ state: row.state, lines, shipping }),
  }
}

function events(orderId: number): RewardOrderEvent[] {
  return db.prepare(`
    SELECT e.id, e.action, e.detail, u.name AS actor_name, e.created_at
    FROM reward_order_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.reward_order_id = ?
    ORDER BY e.id DESC
  `).all(orderId) as RewardOrderEvent[]
}

function toRequest(c: ClaimRow): RewardRequest {
  return {
    reward_id: c.id,
    user_id: c.user_id,
    full_name: c.full_name,
    email: c.email,
    company: c.company,
    certificate_number: c.certificate_number,
    avg_score: c.avg_score,
    submitted_at: c.submitted_at,
    product: c.product,
    product_sku: c.product_sku,
    shirt_size: c.shirt_size,
    address1: c.address1,
    address2: c.address2,
    city: c.city,
    state: c.state,
    zip: c.zip,
    fulfilled: !!c.fulfilled,
    fulfilled_at: c.fulfilled_at,
  }
}

// Woo customer lookups are best-effort and cached briefly: every write returns
// a fresh detail, and none of them should wait on Woo twice for the same email.
const CUSTOMER_TTL_MS = 5 * 60_000
const customerCache = new Map<string, { id: number | null; at: number }>()

/** Test hook — forget cached Woo customer ids. */
export function clearCustomerCache(): void {
  customerCache.clear()
}

async function lookupCustomer(email: string): Promise<number | null> {
  const key = email.trim().toLowerCase()
  const hit = customerCache.get(key)
  if (hit && Date.now() - hit.at < CUSTOMER_TTL_MS) return hit.id
  if (!woo.isConfigured()) return null
  try {
    const id = await woo.findCustomerByEmail(email)
    customerCache.set(key, { id, at: Date.now() })
    return id
  } catch {
    return null // best-effort; never cached, so the next call retries
  }
}

/** GET /api/reward-orders/:rewardId — creates nothing. */
export async function getDetail(rewardId: number): Promise<RewardOrderDetail> {
  const claim = requireClaim(rewardId)
  const row = getOrderRow(rewardId)
  return {
    request: toRequest(claim),
    order: row ? serialize(row) : null,
    events: row ? events(row.id) : [],
    woo_customer_id: await lookupCustomer(claim.email),
  }
}

// ─── Writes: helpers ──────────────────────────────────────────────────────────

function recordEvent(orderId: number, action: RewardOrderEvent['action'], detail: string | null, actorId: number | null): void {
  db.prepare('INSERT INTO reward_order_events (reward_order_id, action, detail, actor_id) VALUES (?, ?, ?, ?)')
    .run(orderId, action, detail, actorId)
}

/** Strip anything credential-shaped and cap the length before it is stored or shown. */
export function sanitizeError(message: unknown): string {
  let text = typeof message === 'string' ? message : 'Unknown error'
  const cfg = woo.getConfig()
  for (const secret of [cfg?.key, cfg?.secret]) {
    if (secret) text = text.split(secret).join('[redacted]')
  }
  return text
    .replace(/\b(ck|cs)_[A-Za-z0-9]{8,}\b/g, '[redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/=]{8,}/g, 'Basic [redacted]')
    .slice(0, 500)
}

/**
 * THE single writer of cert_rewards.fulfilled / fulfilled_at. Returns the
 * stored row (so callers apply the server's timestamp), or null if the claim
 * does not exist.
 *
 * fulfilled_at keeps its historical ISO-8601 format: the clients render it
 * with `new Date(value)`, and it is never compared against datetime('now').
 */
export function setRewardFulfilled(rewardId: number, fulfilled: boolean):
  { ok: true; id: number; fulfilled: 0 | 1; fulfilled_at: string | null } | null {
  const exists = db.prepare('SELECT id FROM cert_rewards WHERE id = ?').get(rewardId)
  if (!exists) return null
  const sentAt = fulfilled ? new Date().toISOString() : null
  db.prepare('UPDATE cert_rewards SET fulfilled = ?, fulfilled_at = ? WHERE id = ?')
    .run(fulfilled ? 1 : 0, sentAt, rewardId)
  return { ok: true, id: rewardId, fulfilled: fulfilled ? 1 : 0, fulfilled_at: sentAt }
}

/**
 * Woo status → "items sent": completed ⇒ sent; cancelled/refunded/failed ⇒ not
 * sent; anything else leaves the switch alone. Writes only on a real change so
 * re-syncing a completed order never re-stamps the sent date.
 */
function applyFulfilmentRule(rewardId: number, wooStatus: string | null): void {
  let target: boolean | null = null
  if (wooStatus === 'completed') target = true
  else if (wooStatus === 'cancelled' || wooStatus === 'refunded' || wooStatus === 'failed') target = false
  if (target === null) return
  const cur = db.prepare('SELECT fulfilled FROM cert_rewards WHERE id = ?').get(rewardId) as { fulfilled: number | null } | undefined
  if (!cur || !!cur.fulfilled === target) return
  setRewardFulfilled(rewardId, target)
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first_name: parts[0] ?? '', last_name: '' }
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] }
}

/**
 * The claim's SKU: the stored one, else a label that matches exactly one
 * reward product (persisted, so the match is made once). Labels omit the brand
 * and can collide, so zero or several matches means an admin must choose.
 */
function resolveClaimSku(claim: ClaimRow): string | null {
  if (claim.product_sku) return claim.product_sku
  const wanted = claim.product.trim().toLowerCase()
  const products = deriveRewardProducts()
  let matches = products.filter(p => p.label.trim().toLowerCase() === wanted)
  if (matches.length === 0) matches = products.filter(p => p.name.trim().toLowerCase() === wanted)
  if (matches.length !== 1) return null
  db.prepare('UPDATE cert_rewards SET product_sku = ? WHERE id = ?').run(matches[0].sku, claim.id)
  return matches[0].sku
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Build (or rebuild) the draft order from the claim. Allowed in draft / failed / deleted only. */
export async function buildDraft(rewardId: number, actorId: number | null): Promise<RewardOrderDetail> {
  const claim = requireClaim(rewardId)
  const existing = getOrderRow(rewardId)
  if (existing && !['draft', 'failed', 'deleted'].includes(existing.state)) {
    throw new RewardOrderError(409, `Cannot rebuild an order that is ${existing.state}`)
  }

  const configured = woo.isConfigured()
  const settings = getRewardItemSettings()
  const lines: RewardOrderLine[] = []

  // Product
  const sku = resolveClaimSku(claim)
  const product: RewardOrderLine = {
    kind: 'product', sku, woo_product_id: null, woo_variation_id: null,
    name: claim.product, quantity: 1, issue: null,
  }
  if (!sku) {
    product.issue = ISSUE_PRODUCT_UNMATCHED
  } else if (!configured) {
    product.issue = ISSUE_WOO_NOT_CONFIGURED
  } else {
    try {
      const match = await woo.findBySku(sku)
      if (match) {
        product.woo_product_id = match.product_id
        product.woo_variation_id = match.variation_id
      } else {
        product.issue = `SKU ${sku} was not found in WooCommerce — choose the product`
      }
    } catch {
      product.issue = ISSUE_WOO_UNREACHABLE
    }
  }
  lines.push(product)

  // T-shirt (a variable product; the claimed size picks the variation)
  const variation = settings.shirt_size_variations[claim.shirt_size] ?? null
  lines.push({
    kind: 'shirt', sku: null,
    woo_product_id: settings.shirt_product_id,
    woo_variation_id: settings.shirt_product_id ? variation : null,
    name: `Sliquid Certified Expert T-shirt (${claim.shirt_size})`,
    quantity: 1,
    issue: !settings.shirt_product_id
      ? ISSUE_SHIRT_UNMAPPED
      : !variation ? `No WooCommerce variation is mapped for shirt size ${claim.shirt_size}` : null,
  })

  // Pin (a simple product)
  lines.push({
    kind: 'pin', sku: null,
    woo_product_id: settings.pin_product_id, woo_variation_id: null,
    name: 'Sliquid Certified Expert pin', quantity: 1,
    issue: settings.pin_product_id ? null : ISSUE_PIN_UNMAPPED,
  })

  const shipping: RewardOrderShipping = {
    ...emptyShipping(),
    ...splitName(claim.full_name),
    address_1: claim.address1,
    address_2: claim.address2 ?? '',
    city: claim.city,
    state: claim.state.trim().toUpperCase(),
    postcode: claim.zip,
    country: 'US',
  }

  // Upsert on cert_reward_id. A rebuild is a fresh draft: any Woo ids from a
  // trashed order stay only in the event history.
  db.prepare(`
    INSERT INTO reward_orders (cert_reward_id, state, lines, shipping, customer_note, created_by)
    VALUES (?, 'draft', ?, ?, NULL, ?)
    ON CONFLICT(cert_reward_id) DO UPDATE SET
      state = 'draft', lines = excluded.lines, shipping = excluded.shipping, customer_note = NULL,
      woo_order_id = NULL, woo_order_number = NULL, woo_status = NULL, last_error = NULL,
      pushed_by = NULL, pushed_at = NULL, last_synced_at = NULL, updated_at = datetime('now')
  `).run(rewardId, JSON.stringify(lines), JSON.stringify(shipping), actorId)

  const row = getOrderRow(rewardId)!
  recordEvent(row.id, 'drafted', existing ? `Rebuilt from the claim (was ${existing.state})` : 'Built from the claim', actorId)
  return getDetail(rewardId)
}

// ── PUT validation ──

function bad(message: string): never {
  throw new RewardOrderError(400, message)
}

function optPositiveInt(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) bad(`${field} must be a positive integer or null`)
  return v
}

function validateLines(raw: unknown): RewardOrderLine[] {
  if (!Array.isArray(raw)) bad('lines must be an array')
  if (raw.length > 20) bad('At most 20 line items')
  return raw.map((l: unknown, i: number): RewardOrderLine => {
    if (!l || typeof l !== 'object' || Array.isArray(l)) bad(`lines[${i}] must be an object`)
    const o = l as Record<string, unknown>
    if (!LINE_KINDS.includes(o.kind as RewardOrderLineKind)) bad(`lines[${i}].kind must be one of ${LINE_KINDS.join(', ')}`)
    if (o.sku !== null && o.sku !== undefined && (typeof o.sku !== 'string' || o.sku.length > 100)) bad(`lines[${i}].sku must be a string or null`)
    if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 200) bad(`lines[${i}].name is required (≤200 characters)`)
    if (typeof o.quantity !== 'number' || !Number.isInteger(o.quantity) || o.quantity < 1 || o.quantity > 99) {
      bad(`lines[${i}].quantity must be a whole number from 1 to 99`)
    }
    if (o.issue !== null && o.issue !== undefined && typeof o.issue !== 'string') bad(`lines[${i}].issue must be a string or null`)
    const line: RewardOrderLine = {
      kind: o.kind as RewardOrderLineKind,
      sku: typeof o.sku === 'string' && o.sku.trim() ? o.sku.trim() : null,
      woo_product_id: optPositiveInt(o.woo_product_id, `lines[${i}].woo_product_id`),
      woo_variation_id: optPositiveInt(o.woo_variation_id, `lines[${i}].woo_variation_id`),
      name: o.name.trim(),
      quantity: o.quantity as number,
      issue: null,
    }
    line.issue = lineIssue(line, typeof o.issue === 'string' ? o.issue.slice(0, 300) : null)
    return line
  })
}

function validateShipping(raw: unknown, current: RewardOrderShipping): RewardOrderShipping {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('shipping must be an object')
  const out = { ...current }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!SHIPPING_KEYS.includes(k as keyof RewardOrderShipping)) bad(`Unknown shipping field: ${k}`)
    if (typeof v !== 'string' || v.length > 200) bad(`shipping.${k} must be a string (≤200 characters)`)
    out[k as keyof RewardOrderShipping] = v.trim()
  }
  return out
}

/** Save admin edits to a draft (or a failed push). */
export async function updateDraft(rewardId: number, patch: unknown, actorId: number | null): Promise<RewardOrderDetail> {
  requireClaim(rewardId)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) bad('Body must be an object')
  for (const k of Object.keys(patch)) {
    if (!['lines', 'shipping', 'customer_note'].includes(k)) bad(`Unknown field: ${k}`)
  }
  const p = patch as RewardOrderPatch
  const row = getOrderRow(rewardId)
  if (!row) throw new RewardOrderError(404, 'Build a draft first')
  if (row.state !== 'draft' && row.state !== 'failed') {
    throw new RewardOrderError(409, `Cannot edit an order that is ${row.state}`)
  }

  const lines = p.lines !== undefined ? validateLines(p.lines) : parseLines(row)
  const shipping = p.shipping !== undefined ? validateShipping(p.shipping, parseShipping(row)) : parseShipping(row)
  let note = row.customer_note
  if (p.customer_note !== undefined) {
    if (p.customer_note !== null && (typeof p.customer_note !== 'string' || p.customer_note.length > 2000)) {
      bad('customer_note must be a string (≤2000 characters) or null')
    }
    note = p.customer_note?.trim() ? p.customer_note.trim() : null
  }

  db.prepare(`
    UPDATE reward_orders SET lines = ?, shipping = ?, customer_note = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(lines), JSON.stringify(shipping), note, row.id)
  const changed = (['lines', 'shipping', 'customer_note'] as const).filter(k => p[k] !== undefined)
  recordEvent(row.id, 'edited', changed.length ? `Edited ${changed.join(', ').replace('customer_note', 'note')}` : null, actorId)
  return getDetail(rewardId)
}

function buildPayload(claim: ClaimRow, order: RewardOrder, customerId: number): Record<string, unknown> {
  const settings = getRewardItemSettings()
  const s = order.shipping
  return {
    status: 'processing',
    set_paid: false,
    payment_method: 'sliquid_reward',
    payment_method_title: 'Sliquid Certification Reward',
    customer_id: customerId,
    customer_note: order.customer_note ?? '',
    billing: {
      first_name: s.first_name, last_name: s.last_name, company: s.company,
      address_1: s.address_1, address_2: s.address_2, city: s.city, state: s.state,
      postcode: s.postcode, country: s.country || 'US', email: claim.email,
    },
    shipping: { ...s, country: s.country || 'US' },
    line_items: order.lines.map(l => ({
      product_id: l.woo_product_id,
      ...(l.woo_variation_id ? { variation_id: l.woo_variation_id } : {}),
      quantity: l.quantity,
      subtotal: '0.00',
      total: '0.00',
    })),
    shipping_lines: [{
      method_id: settings.shipping_method_id,
      method_title: settings.shipping_method_title,
      total: '0.00',
    }],
    meta_data: [
      { key: '_sliquid_reward_id', value: String(claim.id) },
      { key: '_sliquid_certificate', value: claim.certificate_number ?? '' },
    ],
  }
}

/** Create the $0 Woo order (or adopt one an interrupted push already created). */
export async function push(rewardId: number, actorId: number | null): Promise<RewardOrderDetail> {
  const claim = requireClaim(rewardId)
  if (!woo.isConfigured()) throw new RewardOrderError(503, 'WooCommerce is not configured')

  // Atomic flip: exactly one caller gets past this.
  const flip = db.transaction((): RewardOrderRowFlip => {
    const row = getOrderRow(rewardId)
    if (!row) throw new RewardOrderError(404, 'Build a draft first')
    const stale = row.state === 'pushing' && isStale(row.updated_at)
    if (row.state !== 'draft' && row.state !== 'failed' && !stale) {
      throw new RewardOrderError(409, row.state === 'pushing'
        ? 'A push to WooCommerce is already in progress'
        : `Cannot push an order that is ${row.state}`)
    }
    const order = serialize({ ...row, state: 'draft' })
    if (order.issues.length > 0) {
      throw new RewardOrderError(400, 'Fix the issues before pushing', order.issues)
    }
    db.prepare("UPDATE reward_orders SET state = 'pushing', last_error = NULL, updated_at = datetime('now') WHERE id = ?").run(row.id)
    return { row, order }
  })
  const { row, order } = flip()

  try {
    let created: WooOrder
    let recovered = false
    const existing = await woo.findOrderByRewardId(rewardId, {
      email: claim.email, certificateNumber: claim.certificate_number,
    })
    if (existing) {
      created = existing
      recovered = true
    } else {
      const customerId = (await lookupCustomer(claim.email)) ?? 0
      created = await woo.createOrder(buildPayload(claim, order, customerId))
      if (!created?.id) throw new Error('WooCommerce returned no order id')
    }

    db.prepare(`
      UPDATE reward_orders SET state = 'pushed', woo_order_id = ?, woo_order_number = ?, woo_status = ?,
        last_error = NULL, pushed_by = ?, pushed_at = datetime('now'), last_synced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(created.id, String(created.number ?? created.id), created.status ?? null, actorId, row.id)
    recordEvent(row.id, 'pushed',
      `Order #${created.number ?? created.id}${recovered ? ' (adopted an order an earlier push had already created)' : ''}`,
      actorId)

    if (!recovered) {
      const actor = actorId ? (db.prepare('SELECT name FROM users WHERE id = ?').get(actorId) as { name: string } | undefined) : undefined
      woo.addOrderNote(created.id,
        `Sliquid Certified Expert reward for ${claim.full_name} (certificate ${claim.certificate_number ?? 'n/a'}), `
        + `created from the partner portal${actor ? ` by ${actor.name}` : ''}.`)
        .catch(() => { /* the note is a courtesy; the order exists either way */ })
    }
    applyFulfilmentRule(rewardId, created.status ?? null)
  } catch (e: any) {
    const message = sanitizeError(e?.message)
    db.prepare("UPDATE reward_orders SET state = 'failed', last_error = ?, updated_at = datetime('now') WHERE id = ?")
      .run(message, row.id)
    recordEvent(row.id, 'push_failed', message, actorId)
    notifyAdmins('reward_order_failed', 'Reward order failed', `${claim.full_name} — ${message}`, '/marketing-requests')
  }
  return getDetail(rewardId)
}

interface RewardOrderRowFlip { row: OrderRow; order: RewardOrder }

function isStale(updatedAt: string): boolean {
  const t = Date.parse(updatedAt.replace(' ', 'T') + 'Z')
  return Number.isFinite(t) && Date.now() - t > STALE_PUSHING_MINUTES * 60_000
}

function requirePushed(rewardId: number): OrderRow {
  const row = getOrderRow(rewardId)
  if (!row) throw new RewardOrderError(404, 'No order for this claim')
  if (row.state !== 'pushed' || !row.woo_order_id) {
    throw new RewardOrderError(409, 'The order has not been pushed to WooCommerce')
  }
  return row
}

function wooFailure(e: unknown): RewardOrderError {
  if (e instanceof RewardOrderError) return e
  if (e instanceof WooError && e.wooCode === 'not_configured') return new RewardOrderError(503, 'WooCommerce is not configured')
  return new RewardOrderError(502, sanitizeError((e as Error)?.message))
}

/** Set the Woo order status; completed / cancelled / refunded / failed also move "items sent". */
export async function setStatus(rewardId: number, status: unknown, actorId: number | null): Promise<RewardOrderDetail> {
  requireClaim(rewardId)
  if (typeof status !== 'string' || !status.trim()) bad('status is required')
  const slug = status.trim().replace(/^wc-/, '')
  const row = requirePushed(rewardId)
  if (!woo.isConfigured()) throw new RewardOrderError(503, 'WooCommerce is not configured')

  const statuses = await woo.getOrderStatuses()
  if (!statuses.some(s => s.slug === slug)) bad(`Unknown order status: ${slug}`)

  let updated: WooOrder
  try {
    updated = await woo.updateOrder(row.woo_order_id!, { status: slug })
  } catch (e) {
    throw wooFailure(e)
  }
  const newStatus = updated?.status ?? slug
  db.prepare("UPDATE reward_orders SET woo_status = ?, last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(newStatus, row.id)
  recordEvent(row.id, 'status', `${row.woo_status ?? 'unknown'} → ${newStatus}`, actorId)
  applyFulfilmentRule(rewardId, newStatus)
  return getDetail(rewardId)
}

/**
 * Pull one pushed order's status from Woo. A changed status is stored, logged
 * and runs the fulfilment rule; a trashed or permanently deleted Woo order
 * moves the row to 'deleted'. Returns whether anything changed.
 */
async function refreshRow(row: OrderRow, actorId: number | null): Promise<boolean> {
  const remote = await woo.getOrder(row.woo_order_id!)
  if (!remote || remote.status === 'trash') {
    db.prepare("UPDATE reward_orders SET state = 'deleted', woo_status = 'trash', last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(row.id)
    recordEvent(row.id, 'deleted', remote ? 'Trashed in WooCommerce' : 'No longer exists in WooCommerce', actorId)
    return true
  }
  const changed = remote.status !== row.woo_status
  db.prepare(`
    UPDATE reward_orders SET woo_status = ?, woo_order_number = COALESCE(?, woo_order_number),
      last_synced_at = datetime('now')${changed ? ", updated_at = datetime('now')" : ''}
    WHERE id = ?
  `).run(remote.status, remote.number ? String(remote.number) : null, row.id)
  if (changed) {
    recordEvent(row.id, 'refreshed', `${row.woo_status ?? 'unknown'} → ${remote.status} (changed in WooCommerce)`, actorId)
    applyFulfilmentRule(row.cert_reward_id, remote.status)
  }
  return changed
}

/** POST /:rewardId/refresh — on demand, for one order. */
export async function refresh(rewardId: number, actorId: number | null): Promise<RewardOrderDetail> {
  requireClaim(rewardId)
  const row = requirePushed(rewardId)
  if (!woo.isConfigured()) throw new RewardOrderError(503, 'WooCommerce is not configured')
  try {
    await refreshRow(row, actorId)
  } catch (e) {
    throw wooFailure(e)
  }
  return getDetail(rewardId)
}

/**
 * Refresh the Woo status of every pushed order that is not in a final state.
 * Called from the 10-minute Woo interval in index.ts. Returns rows updated.
 * One order failing never stops the rest.
 */
export async function syncRewardOrderStatuses(): Promise<number> {
  if (!woo.isConfigured()) return 0
  const placeholders = FINAL_WOO_STATUSES.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT * FROM reward_orders
    WHERE state = 'pushed' AND woo_order_id IS NOT NULL
      AND (woo_status IS NULL OR woo_status NOT IN (${placeholders}))
    ORDER BY id
  `).all(...FINAL_WOO_STATUSES) as OrderRow[]
  let updated = 0
  for (const row of rows) {
    try {
      if (await refreshRow(row, null)) updated++
    } catch (e: any) {
      console.error(`[reward-orders] Status refresh failed for reward ${row.cert_reward_id}: ${sanitizeError(e?.message)}`)
    }
  }
  return updated
}

/**
 * DELETE: a draft / failed row is discarded; a pushed order is trashed in Woo
 * (recoverable there) and the row kept as 'deleted' for its history.
 */
export async function remove(rewardId: number, actorId: number | null): Promise<RewardOrderDetail> {
  requireClaim(rewardId)
  const row = getOrderRow(rewardId)
  if (!row) throw new RewardOrderError(404, 'No order for this claim')
  if (row.state === 'pushing') throw new RewardOrderError(409, 'A push to WooCommerce is in progress — try again shortly')

  if (row.state === 'draft' || row.state === 'failed') {
    db.prepare('DELETE FROM reward_order_events WHERE reward_order_id = ?').run(row.id)
    db.prepare('DELETE FROM reward_orders WHERE id = ?').run(row.id)
    return getDetail(rewardId)
  }

  if (row.state === 'pushed' && row.woo_order_id) {
    if (!woo.isConfigured()) throw new RewardOrderError(503, 'WooCommerce is not configured')
    try {
      await woo.trashOrder(row.woo_order_id)
    } catch (e) {
      // Already gone from Woo is the outcome we wanted.
      if (!(e instanceof WooError && (e.status === 404 || e.status === 410))) throw wooFailure(e)
    }
    db.prepare("UPDATE reward_orders SET state = 'deleted', woo_status = 'trash', updated_at = datetime('now') WHERE id = ?").run(row.id)
    recordEvent(row.id, 'deleted', `Order #${row.woo_order_number ?? row.woo_order_id} moved to the WooCommerce trash`, actorId)
  }
  // Already deleted: nothing to do.
  return getDetail(rewardId)
}

/** "Email the user" — order number + status in the partner's language, plus an optional note. */
export async function emailPartner(rewardId: number, message: unknown, actorId: number | null): Promise<RewardOrderDetail> {
  const claim = requireClaim(rewardId)
  if (message !== undefined && message !== null && typeof message !== 'string') bad('message must be a string')
  const text = typeof message === 'string' ? message.trim() : ''
  if (text.length > 2000) bad('message must be at most 2000 characters')

  const row = getOrderRow(rewardId)
  if (!row || !row.woo_order_number || row.state !== 'pushed') {
    throw new RewardOrderError(409, 'Push the order to WooCommerce before emailing the partner')
  }
  const status = row.woo_status ?? 'processing'
  let wooName: string | null = null
  if (woo.isConfigured()) {
    wooName = (await woo.getOrderStatuses()).find(s => s.slug === status)?.name ?? null
  }

  let sent: boolean
  try {
    sent = await sendRewardOrderUpdateEmail({
      toName: claim.full_name,
      toEmail: claim.email,
      orderNumber: row.woo_order_number,
      status,
      statusLabel: wooName,
      message: text || null,
      language: preferredLanguageOf(claim.user_id),
    })
  } catch (e: any) {
    console.error('[email] Reward order update email failed:', e?.text ?? e?.message ?? e)
    throw new RewardOrderError(502, 'The email could not be sent — try again')
  }
  if (!sent) throw new RewardOrderError(503, 'Email is not configured on the server')

  recordEvent(row.id, 'emailed',
    text ? `Status ${status}, with a message: ${text.length > 200 ? `${text.slice(0, 200)}…` : text}` : `Status ${status}`,
    actorId)
  return getDetail(rewardId)
}

/** Admin Dashboard "Orders" card. Counts only claims with a valid certificate, like GET /certificates/rewards. */
export function summary(): RewardOrderSummary {
  const rows = db.prepare(`
    SELECT ro.state AS state, ro.woo_status AS woo_status
    FROM cert_rewards cr
    LEFT JOIN reward_orders ro ON ro.cert_reward_id = cr.id
    WHERE EXISTS (SELECT 1 FROM certificates c WHERE c.user_id = cr.user_id AND c.is_valid = 1)
  `).all() as { state: RewardOrderState | null; woo_status: string | null }[]

  const out: RewardOrderSummary = {
    claims_total: rows.length, not_started: 0, draft: 0, pushing: 0, failed: 0, pushed: 0, by_woo_status: {},
  }
  for (const r of rows) {
    // A deleted (trashed) order needs a decision again, so it counts as not started.
    if (!r.state || r.state === 'deleted') out.not_started++
    else if (r.state === 'pushed') {
      out.pushed++
      const k = r.woo_status ?? 'unknown'
      out.by_woo_status[k] = (out.by_woo_status[k] ?? 0) + 1
    } else out[r.state]++
  }
  return out
}
