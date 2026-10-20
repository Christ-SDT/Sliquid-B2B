import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedLegalUser } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

const BASE = '/api/admin/sso-notifications'
const SECRET = 'route-test-secret-NEVER-IN-A-BODY'
const ENV_KEYS = ['SSO_NOTIFICATIONS_URL', 'SSO_ISSUER', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET', 'PORTAL_URL'] as const
const savedEnv: Record<string, string | undefined> = {}

let admin: string
let legal: string
let tier1: string
let fetchMock: ReturnType<typeof vi.fn>

function configure() {
  process.env.SSO_ISSUER = 'https://sso.test'
  process.env.SSO_CLIENT_ID = 'partner-portal'
  process.env.SSO_CLIENT_SECRET = SECRET
}

const respond = (status: number, body: unknown = { id: 'x' }) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function seedOutbox(opts: { delivered?: boolean; error?: string } = {}): number {
  const eventId = crypto.randomUUID()
  const payload = {
    event_id: eventId, type: 'reward_claim', title: 'Reward claimed', message: 'm',
    link: null, audience_roles: ['sliquid_sales'], occurred_at: new Date().toISOString(),
  }
  const r = db.prepare(`
    INSERT INTO notification_outbox (event_id, type, payload, attempts, next_attempt_at, delivered_at, last_error)
    VALUES (?, ?, ?, ?, datetime('now', '+6 hours'), ?, ?)
  `).run(eventId, payload.type, JSON.stringify(payload), opts.error ? 3 : 0,
    opts.delivered ? '2026-01-01 00:00:00' : null, opts.error ?? null)
  return r.lastInsertRowid as number
}

const enabledSetting = () =>
  (db.prepare("SELECT value FROM woo_settings WHERE key = 'sso_notify_enabled'").get() as { value: string } | undefined)?.value

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k] }
  resetDb()
  const { adminId, tier1Id } = seedTestUsers()
  const legalId = seedLegalUser()
  admin = bearerToken(adminId, 'tier5')
  tier1 = bearerToken(tier1Id, 'tier1')
  legal = bearerToken(legalId, 'tier8')
  fetchMock = vi.fn(async () => respond(202))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

afterAll(() => db.close())

describe(`GET ${BASE}`, () => {
  it('401 without a token', async () => {
    expect((await request(app).get(BASE)).status).toBe(401)
  })

  it('403 for tier1', async () => {
    expect((await request(app).get(BASE).set('Authorization', tier1)).status).toBe(403)
  })

  it('200 for admin with the full settings shape and no secret', async () => {
    configure()
    seedOutbox()
    const res = await request(app).get(BASE).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      enabled: false,
      configured: true,
      missing: [],
      url: 'https://sso.test/integrations/notifications',
      counts: { pending: 1, delivered: 0, failing: 0 },
    })
    expect(res.body.eventTypes.map((e: { type: string }) => e.type)).toEqual(Object.keys(res.body.routing))
    expect(res.body.ssoRoles).toContain('sliquid_legal')
    expect(res.body.routing.new_registration).toEqual(
      ['sliquid_sales', 'sliquid_development', 'sliquid_super_admin', 'sliquid_owner'],
    )
    expect(res.body.recent).toHaveLength(1)
    expect(res.body.recent[0]).toMatchObject({ type: 'reward_claim', title: 'Reward claimed', delivered_at: null })
    expect(res.body.recent[0]).not.toHaveProperty('payload')
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
  })

  it('names (never values of) the missing env vars when unconfigured', async () => {
    process.env.SSO_CLIENT_ID = 'partner-portal'
    const res = await request(app).get(BASE).set('Authorization', admin)
    expect(res.body.configured).toBe(false)
    expect(res.body.missing).toEqual(['SSO_NOTIFICATIONS_URL or SSO_ISSUER', 'SSO_CLIENT_SECRET'])
    expect(JSON.stringify(res.body)).not.toContain('partner-portal')
  })

  it('200 for Legal (read-only viewer)', async () => {
    const res = await request(app).get(BASE).set('Authorization', legal)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('routing')
  })

  it('caps recent at 25 rows, newest first', async () => {
    for (let i = 0; i < 30; i++) seedOutbox()
    const res = await request(app).get(BASE).set('Authorization', admin)
    expect(res.body.recent).toHaveLength(25)
    expect(res.body.recent[0].id).toBe(30)
  })
})

describe(`PUT ${BASE}/settings`, () => {
  it('enables the relay and saves routing', async () => {
    const res = await request(app).put(`${BASE}/settings`).set('Authorization', admin)
      .send({ enabled: true, routing: { cert_issued: ['sliquid_owner', 'sliquid_sales', 'sliquid_sales'] } })
    expect(res.status).toBe(200)
    expect(res.body.enabled).toBe(true)
    expect(res.body.routing.cert_issued).toEqual(['sliquid_sales', 'sliquid_owner'])
    // untouched types keep their routing
    expect(res.body.routing.low_stock).toEqual(['sliquid_warehouse_manager'])
    expect(enabledSetting()).toBe('1')

    const off = await request(app).put(`${BASE}/settings`).set('Authorization', admin).send({ enabled: false })
    expect(off.body.enabled).toBe(false)
    expect(off.body.routing.cert_issued).toEqual(['sliquid_sales', 'sliquid_owner'])
  })

  it.each([
    ['an unknown role', { routing: { cert_issued: ['sliquid_wizard'] } }],
    ['an unknown event type', { routing: { made_up: ['sliquid_sales'] } }],
    ['a non-array role list', { routing: { cert_issued: 'sliquid_sales' } }],
    ['a non-object routing', { routing: ['sliquid_sales'] }],
    ['a non-boolean enabled', { enabled: 'yes' }],
  ])('400 for %s, and nothing is stored', async (_label, body) => {
    const res = await request(app).put(`${BASE}/settings`).set('Authorization', admin).send({ enabled: true, ...body })
    expect(res.status).toBe(400)
    expect(enabledSetting()).toBeUndefined()
    expect(db.prepare("SELECT value FROM woo_settings WHERE key = 'sso_notify_routing'").get()).toBeUndefined()
  })

  it('403 for Legal, and nothing changes', async () => {
    const res = await request(app).put(`${BASE}/settings`).set('Authorization', legal).send({ enabled: true })
    expect(res.status).toBe(403)
    expect(enabledSetting()).toBeUndefined()
  })

  it('403 for tier1', async () => {
    const res = await request(app).put(`${BASE}/settings`).set('Authorization', tier1).send({ enabled: true })
    expect(res.status).toBe(403)
  })
})

describe(`POST ${BASE}/test`, () => {
  it('admin gets the test result, never the secret', async () => {
    configure()
    fetchMock.mockImplementation(async () => respond(403, { message: `nope ${SECRET}` }))
    const res = await request(app).post(`${BASE}/test`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('HTTP 403')
    expect(JSON.stringify(res.body)).not.toContain(SECRET)
  })

  it('admin success', async () => {
    configure()
    const res = await request(app).post(`${BASE}/test`).set('Authorization', admin)
    expect(res.body).toEqual({ ok: true, message: 'Delivered (HTTP 202)' })
  })

  it('403 for Legal, with no outbound request', async () => {
    configure()
    const res = await request(app).post(`${BASE}/test`).set('Authorization', legal)
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe(`POST ${BASE}/retry/:id`, () => {
  it('makes a failing row due and drains it', async () => {
    configure()
    await request(app).put(`${BASE}/settings`).set('Authorization', admin).send({ enabled: true })
    const id = seedOutbox({ error: 'HTTP 500' })
    const res = await request(app).post(`${BASE}/retry/${id}`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const r = res.body.recent.find((x: { id: number }) => x.id === id)
    expect(r.delivered_at).not.toBeNull()
    expect(r.last_error).toBeNull()
    expect(res.body.counts).toEqual({ pending: 0, delivered: 1, failing: 0 })
  })

  it('404 for a delivered row', async () => {
    const id = seedOutbox({ delivered: true })
    expect((await request(app).post(`${BASE}/retry/${id}`).set('Authorization', admin)).status).toBe(404)
  })

  it('404 for a missing row', async () => {
    expect((await request(app).post(`${BASE}/retry/999`).set('Authorization', admin)).status).toBe(404)
    expect((await request(app).post(`${BASE}/retry/abc`).set('Authorization', admin)).status).toBe(404)
  })

  it('403 for Legal, and the row is untouched', async () => {
    const id = seedOutbox({ error: 'HTTP 500' })
    const before = db.prepare('SELECT next_attempt_at FROM notification_outbox WHERE id = ?').get(id)
    const res = await request(app).post(`${BASE}/retry/${id}`).set('Authorization', legal)
    expect(res.status).toBe(403)
    expect(db.prepare('SELECT next_attempt_at FROM notification_outbox WHERE id = ?').get(id)).toEqual(before)
  })
})

describe(`POST ${BASE}/drain`, () => {
  it('returns the delivered count', async () => {
    configure()
    await request(app).put(`${BASE}/settings`).set('Authorization', admin).send({ enabled: true })
    seedOutbox()
    db.prepare("UPDATE notification_outbox SET next_attempt_at = datetime('now')").run()
    const res = await request(app).post(`${BASE}/drain`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ delivered: 1 })
  })

  it('403 for Legal and tier1', async () => {
    expect((await request(app).post(`${BASE}/drain`).set('Authorization', legal)).status).toBe(403)
    expect((await request(app).post(`${BASE}/drain`).set('Authorization', tier1)).status).toBe(403)
  })
})
