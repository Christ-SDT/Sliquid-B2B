import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { db, resetDb, seedTestUsers, seedCertificate, seedCertReward, seedProduct } from './helpers/db.js'
import { setRewardItemSettings } from '../rewardItemSettings.js'
import {
  buildDraft, push, setStatus, refresh, remove, summary, computeIssues, setRewardFulfilled,
  syncRewardOrderStatuses, updateDraft, clearCustomerCache, RewardOrderError,
  ISSUE_PRODUCT_UNMATCHED, ISSUE_WOO_UNREACHABLE,
} from '../rewardOrders.js'
import { woo, runWooSync, CORE_ORDER_STATUSES } from '../woocommerce.js'

// ─── Fake WooCommerce (fetch stub — never the network) ───────────────────────

const WC_URL = 'https://shop.test'
const WC_KEY = 'ck_unitkey1234567890'
const WC_SECRET = 'cs_unitsecret1234567890'

interface Call { method: string; path: string; query: URLSearchParams; body: any; headers: Record<string, string>; signal: unknown }

function makeFakeWoo() {
  const s = {
    products: [] as any[],
    variations: {} as Record<number, any[]>,
    customers: [] as { id: number; email: string }[],
    orders: new Map<number, any>(),
    nextOrderId: 5001,
    down: false,
    statusReportFails: false,
    failCreate: null as null | { status: number; body: unknown },
    calls: [] as Call[],
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  const notFound = () => json({ code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.' }, 404)

  const fetch = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const path = url.pathname.replace(/^\/wp-json\/wc\/v3/, '')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    s.calls.push({ method, path, query: url.searchParams, body, headers: (init.headers ?? {}) as Record<string, string>, signal: init.signal })
    if (s.down) throw new TypeError('fetch failed')

    let m: RegExpMatchArray | null
    if (method === 'GET' && path === '/system_status') return json({})
    if (method === 'GET' && path === '/products') {
      const sku = url.searchParams.get('sku')
      const search = url.searchParams.get('search')
      if (sku) return json(s.products.filter(p => p.sku === sku))
      if (search) return json(s.products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())))
      const page = Number(url.searchParams.get('page') ?? 1)
      return json(page === 1 ? s.products : [])
    }
    if (method === 'GET' && (m = path.match(/^\/products\/(\d+)\/variations$/))) return json(s.variations[Number(m[1])] ?? [])
    if (method === 'GET' && (m = path.match(/^\/products\/(\d+)$/))) {
      const p = s.products.find(x => x.id === Number(m![1]))
      return p ? json(p) : json({ code: 'woocommerce_rest_product_invalid_id', message: 'Invalid ID.' }, 404)
    }
    if (method === 'GET' && path === '/customers') {
      const email = url.searchParams.get('email')
      return json(s.customers.filter(c => c.email === email))
    }
    if (method === 'GET' && path === '/reports/orders/totals') {
      if (s.statusReportFails) return json({ message: 'nope' }, 500)
      return json([...CORE_ORDER_STATUSES.map(x => ({ ...x, total: 0 })), { slug: 'shipped', name: 'Shipped', total: 0 }])
    }
    if (method === 'GET' && path === '/orders') {
      const search = url.searchParams.get('search')
      const list = [...s.orders.values()].reverse().filter(o => !search || o.billing?.email === search)
      return json(list.filter(o => o.status !== 'trash'))
    }
    if (method === 'POST' && path === '/orders') {
      if (s.failCreate) return json(s.failCreate.body, s.failCreate.status)
      const id = s.nextOrderId++
      const order = { ...body, id, number: String(id), status: body.status ?? 'pending' }
      s.orders.set(id, order)
      return json(order, 201)
    }
    if ((m = path.match(/^\/orders\/(\d+)\/notes$/)) && method === 'POST') return json({ id: 1, note: body.note }, 201)
    if ((m = path.match(/^\/orders\/(\d+)$/))) {
      const id = Number(m[1])
      const order = s.orders.get(id)
      if (!order) return notFound()
      if (method === 'GET') return json(order)
      if (method === 'PUT') { Object.assign(order, body); return json(order) }
      if (method === 'DELETE') { order.status = 'trash'; return json(order) }
    }
    return json({ code: 'rest_no_route', message: 'No route was found matching the URL and request method.' }, 404)
  })
  return { s, fetch, callsTo: (method: string, path: string) => s.calls.filter(c => c.method === method && c.path === path) }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let fake: ReturnType<typeof makeFakeWoo>
let adminId: number
let tier1Id: number
let rewardId: number
const CERT = 'SLQ-2026-ABC123'

function configureWoo() {
  const up = db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)')
  up.run('wc_url', WC_URL); up.run('wc_consumer_key', WC_KEY); up.run('wc_consumer_secret', WC_SECRET)
}

function mapItems() {
  setRewardItemSettings({ shirt_product_id: 900, shirt_size_variations: { M: 901, L: 902 }, pin_product_id: 950 })
}

function orderRow() {
  return db.prepare('SELECT * FROM reward_orders WHERE cert_reward_id = ?').get(rewardId) as any
}
function claimRow() {
  return db.prepare('SELECT * FROM cert_rewards WHERE id = ?').get(rewardId) as any
}

beforeEach(() => {
  resetDb()
  clearCustomerCache()
  ;({ adminId, tier1Id } = seedTestUsers())
  seedCertificate(tier1Id, 'Tier1 User', CERT)
  seedProduct({ name: 'Naturals Silk', brand: 'Sliquid', sku: 'SLK-4', unit_size: '4.2 oz' })
  rewardId = seedCertReward(tier1Id, { product: 'Naturals Silk (4.2 oz)', shirtSize: 'M' })
  configureWoo()
  mapItems()
  fake = makeFakeWoo()
  fake.s.products.push({ id: 101, name: 'Sliquid Naturals Silk 4.2oz', sku: 'SLK-4', type: 'simple', status: 'publish', stock_status: 'instock' })
  vi.stubGlobal('fetch', fake.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => db.close())

// ─── buildDraft ──────────────────────────────────────────────────────────────

describe('buildDraft', () => {
  it('matches the claimed label to its single SKU, persists it, and resolves every line', async () => {
    const d = await buildDraft(rewardId, adminId)
    expect(claimRow().product_sku).toBe('SLK-4')
    const [product, shirt, pin] = d.order!.lines
    expect(product).toMatchObject({ kind: 'product', sku: 'SLK-4', woo_product_id: 101, woo_variation_id: null, quantity: 1, issue: null })
    expect(shirt).toMatchObject({ kind: 'shirt', woo_product_id: 900, woo_variation_id: 901, issue: null })
    expect(pin).toMatchObject({ kind: 'pin', woo_product_id: 950, woo_variation_id: null, issue: null })
    expect(d.order!.shipping).toEqual({
      first_name: 'Tier1', last_name: 'User', company: '', address_1: '123 Main St', address_2: '',
      city: 'Dallas', state: 'TX', postcode: '75201', country: 'US',
    })
    expect(d.order!.state).toBe('draft')
    expect(d.order!.issues).toEqual([])
    expect(d.events.map(e => e.action)).toEqual(['drafted'])
    expect(d.events[0].actor_name).toBe('Test Admin')
  })

  it('uses the last token as the last name', async () => {
    db.prepare("UPDATE cert_rewards SET full_name = 'Mary Ann Smith' WHERE id = ?").run(rewardId)
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.shipping.first_name).toBe('Mary Ann')
    expect(d.order!.shipping.last_name).toBe('Smith')
  })

  it('flags an ambiguous label instead of guessing', async () => {
    seedProduct({ name: 'Naturals Silk', brand: 'Other Brand', sku: 'OTHER-4', unit_size: '4.2 oz' })
    const d = await buildDraft(rewardId, adminId)
    expect(claimRow().product_sku).toBeNull()
    expect(d.order!.lines[0]).toMatchObject({ kind: 'product', sku: null, woo_product_id: null, issue: ISSUE_PRODUCT_UNMATCHED })
    expect(d.order!.issues).toContain(`Product: ${ISSUE_PRODUCT_UNMATCHED}`)
  })

  it('flags a label that matches no product', async () => {
    db.prepare("UPDATE cert_rewards SET product = 'Discontinued Thing' WHERE id = ?").run(rewardId)
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[0].issue).toBe(ISSUE_PRODUCT_UNMATCHED)
  })

  it('prefers the stored product_sku over the label', async () => {
    seedProduct({ name: 'Other', sku: 'OTH-1' })
    fake.s.products.push({ id: 202, name: 'Other', sku: 'OTH-1', type: 'simple' })
    db.prepare("UPDATE cert_rewards SET product_sku = 'OTH-1' WHERE id = ?").run(rewardId)
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[0]).toMatchObject({ sku: 'OTH-1', woo_product_id: 202 })
  })

  it('resolves a SKU that Woo reports as a variation to parent + variation ids', async () => {
    fake.s.products = [{ id: 303, name: 'Silk — 4.2oz', sku: 'SLK-4', type: 'variation', parent_id: 300 }]
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[0]).toMatchObject({ woo_product_id: 300, woo_variation_id: 303, issue: null })
  })

  it('flags a SKU Woo does not have', async () => {
    fake.s.products = []
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[0].woo_product_id).toBeNull()
    expect(d.order!.lines[0].issue).toMatch(/SLK-4 was not found in WooCommerce/)
  })

  it('flags missing shirt and pin mappings', async () => {
    setRewardItemSettings({ shirt_product_id: null, pin_product_id: null })
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[1].issue).toMatch(/Map the reward T-shirt/)
    expect(d.order!.lines[2].issue).toMatch(/Map the reward pin/)
    expect(d.order!.issues).toHaveLength(2)
  })

  it('flags a shirt size with no mapped variation', async () => {
    db.prepare("UPDATE cert_rewards SET shirt_size = '2XL' WHERE id = ?").run(rewardId)
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines[1]).toMatchObject({ woo_product_id: 900, woo_variation_id: null })
    expect(d.order!.lines[1].issue).toMatch(/shirt size 2XL/)
  })

  it('still builds the lines when Woo is unreachable, flagged "retry"', async () => {
    fake.s.down = true
    const d = await buildDraft(rewardId, adminId)
    expect(d.order!.lines).toHaveLength(3)
    expect(d.order!.lines[0].issue).toBe(ISSUE_WOO_UNREACHABLE)
    expect(d.order!.state).toBe('draft')
  })

  it('refuses to rebuild a pushed order, and rebuilds a deleted one as a fresh draft', async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
    await expect(buildDraft(rewardId, adminId)).rejects.toMatchObject({ status: 409 })

    await remove(rewardId, adminId)
    expect(orderRow().state).toBe('deleted')
    const d = await buildDraft(rewardId, adminId)
    expect(d.order).toMatchObject({ state: 'draft', woo_order_id: null, woo_order_number: null, woo_status: null })
  })

  it('404s an unknown claim', async () => {
    await expect(buildDraft(9999, adminId)).rejects.toMatchObject({ status: 404 })
  })
})

// ─── computeIssues ───────────────────────────────────────────────────────────

describe('computeIssues', () => {
  const ok = { first_name: 'A', last_name: 'B', company: '', address_1: '1 St', address_2: '', city: 'C', state: 'TX', postcode: '1', country: 'US' }
  const line = { kind: 'pin' as const, sku: null, woo_product_id: 1, woo_variation_id: null, name: 'Pin', quantity: 1, issue: null }

  it('is empty for a complete draft', () => {
    expect(computeIssues({ state: 'draft', lines: [line], shipping: ok })).toEqual([])
  })

  it('requires the address fields and a first name', () => {
    const issues = computeIssues({ state: 'draft', lines: [line], shipping: { ...ok, first_name: '', address_1: ' ', city: '', state: '', postcode: '' } })
    expect(issues).toHaveLength(5)
  })

  it('requires a Woo id on every line, a variation on the shirt and a whole quantity ≥ 1', () => {
    const issues = computeIssues({
      state: 'draft',
      lines: [
        { ...line, woo_product_id: null },
        { ...line, kind: 'shirt', woo_product_id: 9 },
        { ...line, quantity: 0 },
        { ...line, quantity: 1.5 },
      ],
      shipping: ok,
    })
    expect(issues).toHaveLength(4)
  })

  it('blocks a pushing or pushed order', () => {
    expect(computeIssues({ state: 'pushing', lines: [line], shipping: ok })).toHaveLength(1)
    expect(computeIssues({ state: 'pushed', lines: [line], shipping: ok })).toHaveLength(1)
  })
})

// ─── push ────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('creates a $0 processing order with the reward meta and a $0 shipping line', async () => {
    fake.s.customers.push({ id: 77, email: 'tier1@test.com' })
    await buildDraft(rewardId, adminId)
    const d = await push(rewardId, adminId)

    const creates = fake.callsTo('POST', '/orders')
    expect(creates).toHaveLength(1)
    const body = creates[0].body
    expect(body).toMatchObject({
      status: 'processing',
      set_paid: false,
      payment_method: 'sliquid_reward',
      payment_method_title: 'Sliquid Certification Reward',
      customer_id: 77,
      billing: { first_name: 'Tier1', last_name: 'User', email: 'tier1@test.com', address_1: '123 Main St', city: 'Dallas', state: 'TX', postcode: '75201', country: 'US' },
      shipping: { first_name: 'Tier1', last_name: 'User', address_1: '123 Main St', country: 'US' },
      shipping_lines: [{ method_id: 'free_shipping', method_title: 'Free shipping', total: '0.00' }],
    })
    expect(body.line_items).toEqual([
      { product_id: 101, quantity: 1, subtotal: '0.00', total: '0.00' },
      { product_id: 900, variation_id: 901, quantity: 1, subtotal: '0.00', total: '0.00' },
      { product_id: 950, quantity: 1, subtotal: '0.00', total: '0.00' },
    ])
    expect(body.meta_data).toEqual([
      { key: '_sliquid_reward_id', value: String(rewardId) },
      { key: '_sliquid_certificate', value: CERT },
    ])
    // Every call authenticates with Basic auth and carries a timeout signal.
    expect(creates[0].headers.Authorization).toBe(`Basic ${Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')}`)
    expect(creates[0].signal).toBeInstanceOf(AbortSignal)

    expect(d.order).toMatchObject({ state: 'pushed', woo_order_id: 5001, woo_order_number: '5001', woo_status: 'processing', pushed_by: adminId, issues: ['Already pushed to WooCommerce'] })
    expect(d.order!.woo_admin_url).toBe(`${WC_URL}/wp-admin/post.php?post=5001&action=edit`)
    expect(d.events[0].action).toBe('pushed')
    await vi.waitFor(() => expect(fake.callsTo('POST', '/orders/5001/notes')).toHaveLength(1))
  })

  it('sends customer_id 0 (a guest order) when no Woo customer has the email', async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
    expect(fake.callsTo('POST', '/orders')[0].body.customer_id).toBe(0)
  })

  it('refuses a second push with 409 — sequentially and concurrently', async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
    await expect(push(rewardId, adminId)).rejects.toMatchObject({ status: 409 })
    expect(fake.callsTo('POST', '/orders')).toHaveLength(1)

    await remove(rewardId, adminId)
    await buildDraft(rewardId, adminId)
    const results = await Promise.allSettled([push(rewardId, adminId), push(rewardId, adminId)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(RewardOrderError)
    expect(rejected.reason.status).toBe(409)
    expect(fake.callsTo('POST', '/orders')).toHaveLength(2) // one per push cycle, never two in one
  })

  it('crash recovery: adopts a Woo order that already carries this reward id instead of creating another', async () => {
    await buildDraft(rewardId, adminId)
    fake.s.orders.set(4242, {
      id: 4242, number: '4242', status: 'processing', billing: { email: 'tier1@test.com' },
      meta_data: [{ key: '_sliquid_reward_id', value: String(rewardId) }, { key: '_sliquid_certificate', value: CERT }],
    })
    const d = await push(rewardId, adminId)
    expect(fake.callsTo('POST', '/orders')).toHaveLength(0)
    expect(d.order).toMatchObject({ state: 'pushed', woo_order_id: 4242, woo_order_number: '4242' })
    expect(d.events[0].detail).toMatch(/adopted/)
  })

  it('does not adopt an order whose certificate meta belongs to someone else (another portal DB)', async () => {
    await buildDraft(rewardId, adminId)
    fake.s.orders.set(4242, {
      id: 4242, number: '4242', status: 'processing', billing: { email: 'tier1@test.com' },
      meta_data: [{ key: '_sliquid_reward_id', value: String(rewardId) }, { key: '_sliquid_certificate', value: 'SLQ-2020-OTHER1' }],
    })
    const d = await push(rewardId, adminId)
    expect(fake.callsTo('POST', '/orders')).toHaveLength(1)
    expect(d.order!.woo_order_id).not.toBe(4242)
  })

  it('retries a push orphaned in "pushing" by a crash once it is stale', async () => {
    await buildDraft(rewardId, adminId)
    db.prepare("UPDATE reward_orders SET state = 'pushing', updated_at = datetime('now') WHERE cert_reward_id = ?").run(rewardId)
    await expect(push(rewardId, adminId)).rejects.toMatchObject({ status: 409 })
    db.prepare("UPDATE reward_orders SET updated_at = datetime('now', '-10 minutes') WHERE cert_reward_id = ?").run(rewardId)
    const d = await push(rewardId, adminId)
    expect(d.order!.state).toBe('pushed')
  })

  it('a Woo failure → state failed, a sanitized last_error, and a reward_order_failed admin notification', async () => {
    await buildDraft(rewardId, adminId)
    fake.s.failCreate = { status: 500, body: { code: 'oops', message: `Invalid <b>key</b> ${WC_KEY} / ${WC_SECRET}` } }
    const d = await push(rewardId, adminId)

    expect(d.order!.state).toBe('failed')
    expect(d.order!.last_error).toMatch(/^HTTP 500: Invalid key/)
    expect(d.order!.last_error).not.toContain(WC_KEY)
    expect(d.order!.last_error).not.toContain(WC_SECRET)
    expect(d.events[0]).toMatchObject({ action: 'push_failed' })
    expect(JSON.stringify(d)).not.toContain(WC_SECRET)

    const notes = db.prepare("SELECT * FROM notifications WHERE type = 'reward_order_failed'").all() as any[]
    expect(notes).toHaveLength(1)
    expect(notes[0].user_id).toBe(adminId)
    expect(notes[0].title).toBe('Reward order failed')
    expect(notes[0].message).toMatch(/^Tier1 User — HTTP 500/)
    expect(notes[0].message).not.toContain(WC_SECRET)
    expect(notes[0].link).toBe('/marketing-requests')

    // A failed push can be retried.
    fake.s.failCreate = null
    const retry = await push(rewardId, adminId)
    expect(retry.order).toMatchObject({ state: 'pushed', last_error: null })
  })

  it('a network failure → state failed, nothing created', async () => {
    await buildDraft(rewardId, adminId)
    fake.s.down = true
    const d = await push(rewardId, adminId)
    expect(d.order!.state).toBe('failed')
    expect(d.order!.last_error).toMatch(/Could not reach WooCommerce/)
  })

  it('refuses (400, with the issues) to push a draft that still has issues', async () => {
    setRewardItemSettings({ pin_product_id: null })
    await buildDraft(rewardId, adminId)
    const err = await push(rewardId, adminId).catch(e => e)
    expect(err).toMatchObject({ status: 400 })
    expect(err.issues[0]).toMatch(/Pin/)
    expect(orderRow().state).toBe('draft')
    expect(fake.callsTo('POST', '/orders')).toHaveLength(0)
  })

  it('503s when Woo is not configured', async () => {
    await buildDraft(rewardId, adminId)
    db.prepare("DELETE FROM woo_settings WHERE key LIKE 'wc_%'").run()
    await expect(push(rewardId, adminId)).rejects.toMatchObject({ status: 503 })
    expect(orderRow().state).toBe('draft')
  })
})

// ─── Status + the fulfilment rule ────────────────────────────────────────────

describe('setStatus and the fulfilment rule', () => {
  beforeEach(async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
  })

  it('completed → items sent (fulfilled = 1); cancelled → not sent (0)', async () => {
    let d = await setStatus(rewardId, 'completed', adminId)
    expect(fake.callsTo('PUT', '/orders/5001')[0].body).toEqual({ status: 'completed' })
    expect(d.order!.woo_status).toBe('completed')
    expect(d.request.fulfilled).toBe(true)
    expect(claimRow().fulfilled).toBe(1)
    expect(claimRow().fulfilled_at).toBeTruthy()
    expect(d.events[0]).toMatchObject({ action: 'status', detail: 'processing → completed' })

    d = await setStatus(rewardId, 'cancelled', adminId)
    expect(claimRow().fulfilled).toBe(0)
    expect(claimRow().fulfilled_at).toBeNull()
    expect(d.request.fulfilled).toBe(false)
  })

  it('other statuses leave the switch alone', async () => {
    setRewardFulfilled(rewardId, true)
    await setStatus(rewardId, 'on-hold', adminId)
    expect(claimRow().fulfilled).toBe(1)
  })

  it('accepts a plugin status from the report, rejects an unknown one', async () => {
    await setStatus(rewardId, 'shipped', adminId)
    expect(orderRow().woo_status).toBe('shipped')
    await expect(setStatus(rewardId, 'teleported', adminId)).rejects.toMatchObject({ status: 400 })
  })

  it('falls back to the core statuses when the report is unavailable', async () => {
    fake.s.statusReportFails = true
    await expect(setStatus(rewardId, 'shipped', adminId)).rejects.toMatchObject({ status: 400 })
    await setStatus(rewardId, 'completed', adminId)
    expect(orderRow().woo_status).toBe('completed')
  })
})

describe('setRewardFulfilled — the single writer', () => {
  it('returns the stored row, or null for an unknown claim', () => {
    const on = setRewardFulfilled(rewardId, true)!
    expect(on).toMatchObject({ ok: true, id: rewardId, fulfilled: 1 })
    expect(on.fulfilled_at).toBe(claimRow().fulfilled_at)
    expect(setRewardFulfilled(rewardId, false)).toMatchObject({ fulfilled: 0, fulfilled_at: null })
    expect(setRewardFulfilled(9999, true)).toBeNull()
  })
})

// ─── Refresh / sync ──────────────────────────────────────────────────────────

describe('refresh and syncRewardOrderStatuses', () => {
  beforeEach(async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
  })

  it('picks up a status changed in Woo admin and applies the fulfilment rule', async () => {
    fake.s.orders.get(5001).status = 'completed'
    expect(await syncRewardOrderStatuses()).toBe(1)
    expect(orderRow().woo_status).toBe('completed')
    expect(orderRow().last_synced_at).toBeTruthy()
    expect(claimRow().fulfilled).toBe(1)

    // completed is final — the next sync does not poll it at all.
    const before = fake.callsTo('GET', '/orders/5001').length
    expect(await syncRewardOrderStatuses()).toBe(0)
    expect(fake.callsTo('GET', '/orders/5001').length).toBe(before)
  })

  it('an unchanged order counts as 0 but is stamped', async () => {
    db.prepare('UPDATE reward_orders SET last_synced_at = NULL').run()
    expect(await syncRewardOrderStatuses()).toBe(0)
    expect(orderRow().last_synced_at).toBeTruthy()
  })

  it('a trashed or vanished Woo order → state deleted', async () => {
    fake.s.orders.get(5001).status = 'trash'
    const d = await refresh(rewardId, adminId)
    expect(d.order!.state).toBe('deleted')
    expect(d.order!.woo_order_id).toBe(5001)
  })

  it('a 404 from Woo → state deleted', async () => {
    fake.s.orders.delete(5001)
    expect(await syncRewardOrderStatuses()).toBe(1)
    expect(orderRow().state).toBe('deleted')
  })

  it('is a no-op when Woo is not configured', async () => {
    db.prepare("DELETE FROM woo_settings WHERE key LIKE 'wc_%'").run()
    fake.s.calls.length = 0
    expect(await syncRewardOrderStatuses()).toBe(0)
    expect(fake.s.calls).toHaveLength(0)
  })

  it('one failing order does not stop the sync', async () => {
    fake.s.down = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await syncRewardOrderStatuses()).toBe(0)
    expect(spy.mock.calls.join(' ')).not.toContain(WC_SECRET)
    spy.mockRestore()
  })
})

// ─── Delete ──────────────────────────────────────────────────────────────────

describe('remove', () => {
  it('discards a draft row outright', async () => {
    await buildDraft(rewardId, adminId)
    const d = await remove(rewardId, adminId)
    expect(d.order).toBeNull()
    expect(orderRow()).toBeUndefined()
    expect(fake.s.calls.some(c => c.method === 'DELETE')).toBe(false)
  })

  it('trashes a pushed order in Woo and keeps the row (with its Woo ids) as deleted', async () => {
    await buildDraft(rewardId, adminId)
    await push(rewardId, adminId)
    const d = await remove(rewardId, adminId)
    const del = fake.callsTo('DELETE', '/orders/5001')
    expect(del).toHaveLength(1)
    expect(del[0].query.get('force')).toBeNull() // trash, never a permanent delete
    expect(d.order).toMatchObject({ state: 'deleted', woo_order_id: 5001, woo_order_number: '5001' })
    expect(d.events[0].action).toBe('deleted')
  })

  it('409s while a push is in progress', async () => {
    await buildDraft(rewardId, adminId)
    db.prepare("UPDATE reward_orders SET state = 'pushing' WHERE cert_reward_id = ?").run(rewardId)
    await expect(remove(rewardId, adminId)).rejects.toMatchObject({ status: 409 })
  })
})

// ─── updateDraft ─────────────────────────────────────────────────────────────

describe('updateDraft', () => {
  it('a line given a Woo product clears its issue', async () => {
    seedProduct({ name: 'Naturals Silk', brand: 'Other Brand', sku: 'OTHER-4', unit_size: '4.2 oz' })
    const draft = await buildDraft(rewardId, adminId)
    const lines = draft.order!.lines.map((l, i) => i === 0 ? { ...l, sku: 'SLK-4', woo_product_id: 101, name: 'Silk' } : l)
    const d = await updateDraft(rewardId, { lines, shipping: { company: 'Demo Store' } }, adminId)
    expect(d.order!.issues).toEqual([])
    expect(d.order!.shipping.company).toBe('Demo Store')
    expect(d.order!.shipping.city).toBe('Dallas')
  })
})

// ─── Summary ─────────────────────────────────────────────────────────────────

describe('summary', () => {
  it('counts claims with a valid certificate, by order state and Woo status', async () => {
    // A claim without a valid certificate is not counted.
    const { tier2Id } = { tier2Id: (db.prepare("SELECT id FROM users WHERE email = 'tier2@test.com'").get() as any).id }
    seedCertReward(tier2Id)
    expect(summary()).toMatchObject({ claims_total: 1, not_started: 1, draft: 0, pushed: 0 })

    await buildDraft(rewardId, adminId)
    expect(summary()).toMatchObject({ claims_total: 1, not_started: 0, draft: 1 })
    await push(rewardId, adminId)
    expect(summary()).toEqual({
      claims_total: 1, not_started: 0, draft: 0, pushing: 0, failed: 0, pushed: 1, by_woo_status: { processing: 1 },
    })
  })
})

// ─── WooCommerceService plumbing ─────────────────────────────────────────────

describe('WooCommerceService', () => {
  it('runWooSync still pulls products through the shared request helper', async () => {
    const result = await runWooSync()
    expect(result).toMatchObject({ direction: 'pull', status: 'ok' })
    expect(fake.callsTo('GET', '/products')[0].query.get('per_page')).toBe('100')
  })

  it('errors carry the HTTP status and Woo message but never the credentials', async () => {
    fake.s.failCreate = { status: 401, body: { code: 'woocommerce_rest_cannot_create', message: `Consumer key ${WC_KEY} is invalid` } }
    const err = await woo.createOrder({}).catch(e => e)
    expect(err.status).toBe(401)
    expect(err.message).toContain('HTTP 401')
    expect(err.message).not.toContain(WC_KEY)
  })

  it('testConnection keeps its old messages', async () => {
    expect(await woo.testConnection()).toEqual({ ok: true })
    fake.s.down = true
    expect((await woo.testConnection()).ok).toBe(false)
  })

  it('searchProducts merges the exact-SKU hit and the name search', async () => {
    fake.s.products.push({ id: 102, name: 'Silk travel', sku: 'SLK-2', type: 'simple' })
    const hits = await woo.searchProducts('silk')
    expect(hits.map(h => h.id).sort()).toEqual([101, 102])
    expect(fake.callsTo('GET', '/products').every(c => Number(c.query.get('per_page')) <= 20)).toBe(true)
  })
})
