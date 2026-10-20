import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'

// EmailJS mocked at the SDK boundary (as in email-language.test.ts) so the real
// sender — and the params it builds — is exercised without sending anything.
const send = vi.fn(async (..._args: unknown[]) => ({ status: 200, text: 'OK' }))
vi.mock('@emailjs/nodejs', () => ({ default: { send } }))

process.env.EMAILJS_PUBLIC_KEY = 'test-public'
process.env.EMAILJS_PRIVATE_KEY = 'test-private-emailjs-secret'
process.env.EMAILJS_SERVICE_ID = 'test-service'

const request = (await import('supertest')).default
const { app } = await import('../../app.js')
const { db, resetDb, seedTestUsers, seedLegalUser, seedCertificate, seedCertReward, seedProduct } = await import('../helpers/db.js')
const { bearerToken } = await import('../helpers/auth.js')
const { setRewardItemSettings } = await import('../../rewardItemSettings.js')
const { clearCustomerCache } = await import('../../rewardOrders.js')
const { CORE_ORDER_STATUSES } = await import('../../woocommerce.js')

// ─── Fake WooCommerce (fetch stub — never the network) ───────────────────────
// Same fake as ../rewardOrders.test.ts (kept per-file: test files own no shared helper).

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
let legalId: number
let rewardId: number
const CERT = 'SLQ-2026-ROUTE1'

const admin = () => bearerToken(adminId, 'tier5')
const legal = () => bearerToken(legalId, 'tier8')
const tier1 = () => bearerToken(tier1Id, 'tier1')

function configureWoo() {
  const up = db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)')
  up.run('wc_url', WC_URL); up.run('wc_consumer_key', WC_KEY); up.run('wc_consumer_secret', WC_SECRET)
}
const orderRow = () => db.prepare('SELECT * FROM reward_orders WHERE cert_reward_id = ?').get(rewardId) as any
const eventCount = () => (db.prepare('SELECT COUNT(*) AS n FROM reward_order_events').get() as { n: number }).n

beforeEach(() => {
  resetDb()
  clearCustomerCache()
  send.mockClear()
  ;({ adminId, tier1Id } = seedTestUsers())
  legalId = seedLegalUser()
  seedCertificate(tier1Id, 'Tier1 User', CERT)
  seedProduct({ name: 'Naturals Silk', brand: 'Sliquid', sku: 'SLK-4', unit_size: '4.2 oz' })
  rewardId = seedCertReward(tier1Id, { product: 'Naturals Silk (4.2 oz)', shirtSize: 'M' })
  configureWoo()
  setRewardItemSettings({ shirt_product_id: 900, shirt_size_variations: { M: 901 }, pin_product_id: 950 })
  fake = makeFakeWoo()
  fake.s.products.push({ id: 101, name: 'Sliquid Naturals Silk 4.2oz', sku: 'SLK-4', type: 'simple', status: 'publish', stock_status: 'instock' })
  fake.s.products.push({ id: 900, name: 'Certified Expert Tee', sku: 'TEE', type: 'variable', status: 'publish', stock_status: 'instock' })
  fake.s.variations[900] = [{ id: 901, sku: 'TEE-M', attributes: [{ name: 'Size', option: 'M' }], stock_status: 'instock' }]
  fake.s.customers.push({ id: 77, email: 'tier1@test.com' })
  vi.stubGlobal('fetch', fake.fetch)
})

afterEach(() => vi.unstubAllGlobals())
afterAll(() => db.close())

async function draftAndPush() {
  await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
  const res = await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
  expect(res.body.order.state).toBe('pushed')
  return res
}

// ─── Guards ──────────────────────────────────────────────────────────────────

const READS = (id: () => number): Array<[string, () => string]> => [
  ['GET', () => `/api/reward-orders/${id()}`],
  ['GET', () => '/api/reward-orders/meta/statuses'],
  ['GET', () => '/api/reward-orders/meta/summary'],
  ['GET', () => '/api/reward-orders/meta/products?q=silk'],
  ['GET', () => '/api/reward-orders/meta/products/900/variations'],
]
const WRITES = (id: () => number): Array<[string, () => string, object]> => [
  ['POST', () => `/api/reward-orders/${id()}/draft`, {}],
  ['PUT', () => `/api/reward-orders/${id()}`, { customer_note: 'x' }],
  ['DELETE', () => `/api/reward-orders/${id()}`, {}],
  ['POST', () => `/api/reward-orders/${id()}/push`, {}],
  ['PUT', () => `/api/reward-orders/${id()}/status`, { status: 'completed' }],
  ['POST', () => `/api/reward-orders/${id()}/refresh`, {}],
  ['POST', () => `/api/reward-orders/${id()}/email`, { message: 'hi' }],
]
const call = (method: string, url: string) => (request(app) as any)[method.toLowerCase()](url)

describe('guards', () => {
  it.each(READS(() => rewardId))('Legal (tier8) can read: %s', async (method, url) => {
    const res = await call(method, url()).set('Authorization', legal())
    expect(res.status).toBe(200)
  })

  it.each(WRITES(() => rewardId))('Legal (tier8) is refused every write, and nothing changes: %s', async (method, url, body) => {
    // Give every write something real to act on, so a 403 is not a 404/409 in disguise.
    await draftAndPush()
    const before = { row: JSON.stringify(orderRow()), events: eventCount(), wooCalls: fake.s.calls.length }
    const res = await call(method, url()).set('Authorization', legal()).send(body)
    expect(res.status).toBe(403)
    expect(JSON.stringify(orderRow())).toBe(before.row)
    expect(eventCount()).toBe(before.events)
    expect(fake.s.calls.length).toBe(before.wooCalls)
    expect(send).not.toHaveBeenCalled()
  })

  it.each([...READS(() => rewardId), ...WRITES(() => rewardId)])('tier1 is refused everywhere: %s', async (method, url) => {
    const res = await call(method, url()).set('Authorization', tier1()).send({})
    expect(res.status).toBe(403)
  })

  it('401 without a token', async () => {
    expect((await request(app).get(`/api/reward-orders/${rewardId}`)).status).toBe(401)
    expect((await request(app).post(`/api/reward-orders/${rewardId}/push`)).status).toBe(401)
  })
})

// ─── Reads ───────────────────────────────────────────────────────────────────

describe('GET /api/reward-orders/:rewardId', () => {
  it('returns the claim as requested and no order (and creates nothing)', async () => {
    const res = await request(app).get(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.order).toBeNull()
    expect(res.body.events).toEqual([])
    expect(res.body.woo_customer_id).toBe(77)
    expect(res.body.request).toMatchObject({
      reward_id: rewardId, user_id: tier1Id, full_name: 'Tier1 User', email: 'tier1@test.com', company: 'Demo Store',
      certificate_number: CERT, product: 'Naturals Silk (4.2 oz)', product_sku: null, shirt_size: 'M',
      address1: '123 Main St', city: 'Dallas', state: 'TX', zip: '75201', fulfilled: false, fulfilled_at: null,
    })
    expect(orderRow()).toBeUndefined()
  })

  it('woo_customer_id is null (not an error) when Woo is down', async () => {
    fake.s.down = true
    const res = await request(app).get(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.woo_customer_id).toBeNull()
  })

  it('404 for an unknown claim, 400 for a junk id', async () => {
    expect((await request(app).get('/api/reward-orders/9999').set('Authorization', admin())).status).toBe(404)
    expect((await request(app).get('/api/reward-orders/abc').set('Authorization', admin())).status).toBe(400)
  })
})

describe('meta', () => {
  it('statuses come from Woo, plugin statuses included', async () => {
    const res = await request(app).get('/api/reward-orders/meta/statuses').set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.map((s: any) => s.slug)).toEqual([...CORE_ORDER_STATUSES.map(s => s.slug), 'shipped'])
  })

  it('product search: 400 under 2 characters, 503 when Woo is not configured, hits otherwise', async () => {
    expect((await request(app).get('/api/reward-orders/meta/products?q=s').set('Authorization', admin())).status).toBe(400)
    const ok = await request(app).get('/api/reward-orders/meta/products?q=silk').set('Authorization', admin())
    expect(ok.body).toEqual([{ id: 101, name: 'Sliquid Naturals Silk 4.2oz', sku: 'SLK-4', type: 'simple', status: 'publish', stock_status: 'instock' }])
    db.prepare("DELETE FROM woo_settings WHERE key LIKE 'wc_%'").run()
    const off = await request(app).get('/api/reward-orders/meta/products?q=silk').set('Authorization', admin())
    expect(off.status).toBe(503)
    expect(off.body.message).toBeTruthy()
  })

  it('variations', async () => {
    const res = await request(app).get('/api/reward-orders/meta/products/900/variations').set('Authorization', admin())
    expect(res.body).toEqual([{ id: 901, sku: 'TEE-M', attributes: [{ name: 'Size', option: 'M' }], stock_status: 'instock' }])
  })

  it('summary', async () => {
    const res = await request(app).get('/api/reward-orders/meta/summary').set('Authorization', legal())
    expect(res.body).toEqual({ claims_total: 1, not_started: 1, draft: 0, pushing: 0, failed: 0, pushed: 0, by_woo_status: {} })
  })
})

// ─── The admin flow over HTTP ────────────────────────────────────────────────

describe('draft → edit → push → status → refresh → email → delete', () => {
  it('runs end to end, every write answering with the fresh detail', async () => {
    const draft = await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    expect(draft.status).toBe(200)
    expect(draft.body.order.state).toBe('draft')
    expect(draft.body.request.product_sku).toBe('SLK-4')

    const lines = draft.body.order.lines.map((l: any) => l.kind === 'pin' ? { ...l, quantity: 2 } : l)
    const edit = await request(app).put(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
      .send({ lines, shipping: { address_2: 'Suite 9' }, customer_note: 'Thanks for getting certified!' })
    expect(edit.status).toBe(200)
    expect(edit.body.order.lines[2].quantity).toBe(2)
    expect(edit.body.order.shipping.address_2).toBe('Suite 9')
    expect(edit.body.order.customer_note).toBe('Thanks for getting certified!')

    const pushed = await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
    expect(pushed.status).toBe(200)
    expect(pushed.body.order).toMatchObject({ state: 'pushed', woo_order_number: '5001', woo_status: 'processing' })
    const payload = fake.callsTo('POST', '/orders')[0].body
    expect(payload.customer_id).toBe(77)
    expect(payload.customer_note).toBe('Thanks for getting certified!')
    expect(payload.shipping.address_2).toBe('Suite 9')
    expect(payload.line_items.every((l: any) => l.total === '0.00' && l.subtotal === '0.00')).toBe(true)

    const again = await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
    expect(again.status).toBe(409)
    const editAfter = await request(app).put(`/api/reward-orders/${rewardId}`).set('Authorization', admin()).send({ customer_note: 'late' })
    expect(editAfter.status).toBe(409)

    const status = await request(app).put(`/api/reward-orders/${rewardId}/status`).set('Authorization', admin()).send({ status: 'completed' })
    expect(status.status).toBe(200)
    expect(status.body.order.woo_status).toBe('completed')
    expect(status.body.request.fulfilled).toBe(true)

    fake.s.orders.get(5001).status = 'refunded'
    const refreshed = await request(app).post(`/api/reward-orders/${rewardId}/refresh`).set('Authorization', admin())
    expect(refreshed.body.order.woo_status).toBe('refunded')
    expect(refreshed.body.request.fulfilled).toBe(false)

    const emailed = await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({ message: 'Your box ships Monday.' })
    expect(emailed.status).toBe(200)
    expect(emailed.body.events[0].action).toBe('emailed')

    const deleted = await request(app).delete(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
    expect(deleted.status).toBe(200)
    expect(deleted.headers['content-type']).toMatch(/json/)
    expect(deleted.body.order.state).toBe('deleted')
    expect(fake.callsTo('DELETE', '/orders/5001')).toHaveLength(1)

    const actions = deleted.body.events.map((e: any) => e.action)
    expect(actions).toEqual(['deleted', 'emailed', 'refreshed', 'status', 'pushed', 'edited', 'drafted'])
    expect(JSON.stringify(deleted.body)).not.toContain(WC_SECRET)
    expect(JSON.stringify(deleted.body)).not.toContain(WC_KEY)
  })

  it('a push that fails at Woo answers 200 with state failed and a safe last_error', async () => {
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    fake.s.failCreate = { status: 400, body: { code: 'woocommerce_rest_invalid_product_id', message: `Invalid product ID (${WC_SECRET})` } }
    const res = await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.order.state).toBe('failed')
    expect(res.body.order.last_error).toMatch(/HTTP 400: Invalid product ID/)
    expect(JSON.stringify(res.body)).not.toContain(WC_SECRET)
  })

  it('push with unresolved lines → 400 with the issues', async () => {
    setRewardItemSettings({ pin_product_id: null })
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    const res = await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
    expect(res.status).toBe(400)
    expect(res.body.issues.some((i: string) => i.startsWith('Pin:'))).toBe(true)
  })

  it('deleting a draft removes it; deleting nothing 404s — both as JSON', async () => {
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    const res = await request(app).delete(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.order).toBeNull()
    const none = await request(app).delete(`/api/reward-orders/${rewardId}`).set('Authorization', admin())
    expect(none.status).toBe(404)
    expect(none.body.message).toBeTruthy()
  })

  it('status: 400 without one, 409 before the push', async () => {
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    expect((await request(app).put(`/api/reward-orders/${rewardId}/status`).set('Authorization', admin()).send({})).status).toBe(400)
    expect((await request(app).put(`/api/reward-orders/${rewardId}/status`).set('Authorization', admin()).send({ status: 'completed' })).status).toBe(409)
  })
})

// ─── PUT validation ──────────────────────────────────────────────────────────

describe('PUT /api/reward-orders/:rewardId validation', () => {
  beforeEach(async () => {
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
  })
  const line = { kind: 'pin', sku: null, woo_product_id: 950, woo_variation_id: null, name: 'Pin', quantity: 1, issue: null }

  it.each([
    ['lines not an array', { lines: 'nope' }],
    ['unknown kind', { lines: [{ ...line, kind: 'hat' }] }],
    ['zero quantity', { lines: [{ ...line, quantity: 0 }] }],
    ['fractional quantity', { lines: [{ ...line, quantity: 1.5 }] }],
    ['string product id', { lines: [{ ...line, woo_product_id: '950' }] }],
    ['empty name', { lines: [{ ...line, name: '  ' }] }],
    ['shipping not an object', { shipping: ['x'] }],
    ['unknown shipping field', { shipping: { phone: '555' } }],
    ['non-string shipping value', { shipping: { city: 5 } }],
    ['customer_note not a string', { customer_note: 42 }],
    ['unknown top-level field', { state: 'pushed' }],
  ])('400 on %s, and nothing is saved', async (_label, body) => {
    const before = orderRow()
    const res = await request(app).put(`/api/reward-orders/${rewardId}`).set('Authorization', admin()).send(body)
    expect(res.status).toBe(400)
    expect(res.body.message).toBeTruthy()
    expect(orderRow()).toEqual(before)
  })

  it('choosing a Woo product for an unresolved line clears its issue', async () => {
    seedProduct({ name: 'Naturals Silk', brand: 'Other Brand', sku: 'OTHER-4', unit_size: '4.2 oz' })
    db.prepare('UPDATE cert_rewards SET product_sku = NULL WHERE id = ?').run(rewardId)
    const draft = await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    expect(draft.body.order.issues.length).toBeGreaterThan(0)
    const lines = draft.body.order.lines.map((l: any) => l.kind === 'product' ? { ...l, sku: 'SLK-4', woo_product_id: 101, name: 'Silk' } : l)
    const res = await request(app).put(`/api/reward-orders/${rewardId}`).set('Authorization', admin()).send({ lines })
    expect(res.body.order.issues).toEqual([])
    expect(res.body.order.lines[0].issue).toBeNull()
  })
})

// ─── Email ───────────────────────────────────────────────────────────────────

describe('POST /api/reward-orders/:rewardId/email', () => {
  it('sends portal_reward_order_update in the partner’s language', async () => {
    db.prepare("UPDATE users SET preferred_language = 'es' WHERE id = ?").run(tier1Id)
    await draftAndPush()
    const res = await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({ message: 'Sale el lunes.' })
    expect(res.status).toBe(200)
    const c = send.mock.calls.find(x => x[1] === 'portal_reward_order_update')!
    const p = c[2] as Record<string, string>
    expect(p).toMatchObject({
      to_email: 'tier1@test.com', user_name: 'Tier1 User', order_number: '5001', status: 'processing',
      message: 'Sale el lunes.', lang: 'es', t_status_label: 'En preparación',
    })
    expect(p.t_subject).toBe('Novedades de su pedido de recompensa Sliquid n.º 5001')
    expect(JSON.stringify(res.body)).not.toContain('test-private-emailjs-secret')
  })

  it('works without a message and falls back to the Woo name for a plugin status', async () => {
    await draftAndPush()
    await request(app).put(`/api/reward-orders/${rewardId}/status`).set('Authorization', admin()).send({ status: 'shipped' })
    const res = await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({})
    expect(res.status).toBe(200)
    const p = send.mock.calls.find(x => x[1] === 'portal_reward_order_update')![2] as Record<string, string>
    expect(p.message).toBe('')
    expect(p.t_status_label).toBe('Shipped')
    expect(p.lang).toBe('en')
  })

  it('409 before the order is pushed; 400 for a message over 2000 characters', async () => {
    await request(app).post(`/api/reward-orders/${rewardId}/draft`).set('Authorization', admin())
    expect((await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({})).status).toBe(409)
    await request(app).post(`/api/reward-orders/${rewardId}/push`).set('Authorization', admin())
    const long = await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({ message: 'x'.repeat(2001) })
    expect(long.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('502 (and no event) when EmailJS throws', async () => {
    await draftAndPush()
    send.mockRejectedValueOnce(Object.assign(new Error('boom'), { text: 'bad template' }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post(`/api/reward-orders/${rewardId}/email`).set('Authorization', admin()).send({})
    spy.mockRestore()
    expect(res.status).toBe(502)
    expect((db.prepare("SELECT COUNT(*) AS n FROM reward_order_events WHERE action = 'emailed'").get() as any).n).toBe(0)
  })
})
