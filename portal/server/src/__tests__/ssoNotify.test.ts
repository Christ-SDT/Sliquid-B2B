import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { db, resetDb, seedTestUsers } from './helpers/db.js'
import { notifyAdmins } from '../notifications.js'
import {
  DEFAULT_SSO_ROUTING,
  drainNotificationOutbox,
  getRelayStatus,
  sendTestEvent,
  setSsoNotifySettings,
} from '../ssoNotify.js'

const SECRET = 'sso-test-secret-DO-NOT-LEAK-42'
const CLIENT_ID = 'partner-portal'
const ENV_KEYS = ['SSO_NOTIFICATIONS_URL', 'SSO_ISSUER', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET', 'PORTAL_URL'] as const
const savedEnv: Record<string, string | undefined> = {}

function configure() {
  process.env.SSO_ISSUER = 'https://sso.test'
  process.env.SSO_CLIENT_ID = CLIENT_ID
  process.env.SSO_CLIENT_SECRET = SECRET
  process.env.PORTAL_URL = 'https://portal.test/'
}

function enable() {
  setSsoNotifySettings({ enabled: true })
}

type Row = {
  id: number; event_id: string; type: string; payload: string; attempts: number
  next_attempt_at: string; delivered_at: string | null; last_error: string | null; created_at: string
}
const rows = () => db.prepare('SELECT * FROM notification_outbox ORDER BY id').all() as Row[]
const row = (id: number) => db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(id) as Row
/** Seconds from now until the row's next attempt, computed in SQLite. */
const secondsUntilNext = (id: number) =>
  (db.prepare("SELECT CAST(ROUND((julianday(next_attempt_at) - julianday('now')) * 86400) AS INTEGER) AS s FROM notification_outbox WHERE id = ?")
    .get(id) as { s: number }).s
const makeDue = () => db.prepare("UPDATE notification_outbox SET next_attempt_at = datetime('now')").run()

function seedOutbox(overrides: Partial<{ type: string; created_at: string }> = {}): number {
  const eventId = crypto.randomUUID()
  const payload = {
    event_id: eventId, type: overrides.type ?? 'new_registration', title: 'Seeded', message: 'm',
    link: null, audience_roles: ['sliquid_sales'], occurred_at: new Date().toISOString(),
  }
  const r = db.prepare('INSERT INTO notification_outbox (event_id, type, payload, created_at) VALUES (?, ?, ?, COALESCE(?, datetime(\'now\')))')
    .run(eventId, payload.type, JSON.stringify(payload), overrides.created_at ?? null)
  return r.lastInsertRowid as number
}

const respond = (status: number, body: unknown = { id: 'x' }) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
function stubFetch(impl: (...args: any[]) => Promise<Response>) {
  fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k] }
  resetDb()
  seedTestUsers()
  stubFetch(async () => respond(202))
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

afterAll(() => db.close())

// ─── Enqueue ────────────────────────────────────────────────────────────────

describe('enqueue from notifyAdmins()', () => {
  it('does nothing while the relay is disabled (the default)', () => {
    configure()
    notifyAdmins('new_registration', 'New partner registration', 'Someone registered', '/users')
    expect(rows()).toHaveLength(0)
    // the portal notification itself still lands
    expect((db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number }).n).toBeGreaterThan(0)
  })

  it('enqueues one row with the contract payload when enabled and routed', () => {
    configure()
    enable()
    notifyAdmins('new_registration', 'New partner registration', 'Jane registered', '/users')
    const all = rows()
    expect(all).toHaveLength(1)
    const p = JSON.parse(all[0].payload)
    expect(Object.keys(p).sort()).toEqual(
      ['audience_roles', 'event_id', 'link', 'message', 'occurred_at', 'title', 'type'].sort()
    )
    expect(p.event_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(all[0].event_id).toBe(p.event_id)
    expect(p.type).toBe('new_registration')
    expect(p.title).toBe('New partner registration')
    expect(p.message).toBe('Jane registered')
    expect(p.link).toBe('https://portal.test/users')
    expect(p.audience_roles).toEqual(
      expect.arrayContaining([...DEFAULT_SSO_ROUTING.new_registration])
    )
    expect(p.audience_roles).toHaveLength(DEFAULT_SSO_ROUTING.new_registration.length)
    expect(new Date(p.occurred_at).toISOString()).toBe(p.occurred_at)
    expect(all[0].next_attempt_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  })

  it('never touches the network on enqueue', () => {
    configure()
    enable()
    notifyAdmins('low_stock', 'Low stock', 'x', '/inventory')
    expect(rows()).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves an absolute link as-is and keeps a missing link null', () => {
    configure()
    enable()
    notifyAdmins('cert_issued', 'a', 'b', 'https://elsewhere.test/x')
    notifyAdmins('cert_issued', 'a', 'b')
    const [abs, none] = rows().map(r => JSON.parse(r.payload))
    expect(abs.link).toBe('https://elsewhere.test/x')
    expect(none.link).toBeNull()
  })

  it('defaults PORTAL_URL to the production portal', () => {
    configure()
    delete process.env.PORTAL_URL
    enable()
    notifyAdmins('cert_issued', 'a', 'b', 'users')
    expect(JSON.parse(rows()[0].payload).link).toBe('https://sliquid-portal.pages.dev/users')
  })

  it('does not enqueue an unrouted type or a type routed to nobody', () => {
    configure()
    enable()
    setSsoNotifySettings({ routing: { low_stock: [] } })
    notifyAdmins('low_stock', 'a', 'b')
    notifyAdmins('something_else', 'a', 'b')
    expect(rows()).toHaveLength(0)
  })

  it('uses saved routing', () => {
    configure()
    enable()
    setSsoNotifySettings({ routing: { cert_issued: ['sliquid_owner', 'sliquid_accounting'] } })
    notifyAdmins('cert_issued', 'a', 'b')
    // stored in SSO_ROLES order
    expect(JSON.parse(rows()[0].payload).audience_roles).toEqual(['sliquid_accounting', 'sliquid_owner'])
  })

  it('an enqueue failure never throws out of notifyAdmins, and the portal rows still land', () => {
    configure()
    enable()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.exec('ALTER TABLE notification_outbox RENAME TO notification_outbox_hidden')
    try {
      expect(() => notifyAdmins('new_registration', 'T', 'M', '/users')).not.toThrow()
      const n = (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'new_registration'").get() as { n: number }).n
      expect(n).toBeGreaterThan(0)
    } finally {
      db.exec('ALTER TABLE notification_outbox_hidden RENAME TO notification_outbox')
      errSpy.mockRestore()
    }
  })
})

// ─── Drain ──────────────────────────────────────────────────────────────────

describe('drainNotificationOutbox()', () => {
  it('is a no-op (no fetch at all) while disabled', async () => {
    configure()
    seedOutbox()
    expect(await drainNotificationOutbox()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a no-op while unconfigured', async () => {
    enable()
    seedOutbox()
    expect(await drainNotificationOutbox()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('delivers on 202 with HTTP Basic id:secret and the stored payload', async () => {
    configure()
    enable()
    const id = seedOutbox()
    expect(await drainNotificationOutbox()).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sso.test/integrations/notifications')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64'))
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual(JSON.parse(row(id).payload))
    expect(row(id).delivered_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(row(id).last_error).toBeNull()
  })

  it('SSO_NOTIFICATIONS_URL overrides the issuer-derived URL', async () => {
    configure()
    process.env.SSO_NOTIFICATIONS_URL = 'https://intake.test/hook'
    enable()
    seedOutbox()
    await drainNotificationOutbox()
    expect(fetchMock.mock.calls[0][0]).toBe('https://intake.test/hook')
  })

  it('treats 200 (duplicate event_id) as delivered', async () => {
    configure()
    enable()
    stubFetch(async () => respond(200, { duplicate: true }))
    const id = seedOutbox()
    expect(await drainNotificationOutbox()).toBe(1)
    expect(row(id).delivered_at).not.toBeNull()
  })

  it('backs off exponentially on 500 and stops the batch', async () => {
    configure()
    enable()
    stubFetch(async () => respond(500, { message: 'boom' }))
    const a = seedOutbox()
    const b = seedOutbox()

    expect(await drainNotificationOutbox()).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1) // b was not hammered
    expect(row(a).attempts).toBe(1)
    expect(row(a).last_error).toContain('HTTP 500')
    expect(row(a).next_attempt_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    const first = secondsUntilNext(a)
    expect(first).toBeGreaterThanOrEqual(58)
    expect(first).toBeLessThanOrEqual(61)
    expect(row(b).attempts).toBe(0)

    // Not due yet: a second drain picks b, not a.
    fetchMock.mockClear()
    await drainNotificationOutbox()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).event_id).toBe(row(b).event_id)

    makeDue()
    await drainNotificationOutbox()
    expect(row(a).attempts).toBe(2)
    const second = secondsUntilNext(a)
    expect(second).toBeGreaterThanOrEqual(118)
    expect(second).toBeLessThanOrEqual(121)
    expect(row(a).delivered_at).toBeNull()
  })

  it('caps backoff at 6 hours', async () => {
    configure()
    enable()
    stubFetch(async () => respond(503))
    const id = seedOutbox()
    db.prepare('UPDATE notification_outbox SET attempts = 30 WHERE id = ?').run(id)
    await drainNotificationOutbox()
    const s = secondsUntilNext(id)
    expect(s).toBeGreaterThanOrEqual(6 * 3600 - 2)
    expect(s).toBeLessThanOrEqual(6 * 3600 + 1)
  })

  it.each([401, 403])('%i records the error, keeps the row and backs off to the max', async (status) => {
    configure()
    enable()
    stubFetch(async () => respond(status, { message: 'nope' }))
    const id = seedOutbox()
    await drainNotificationOutbox()
    const r = row(id)
    expect(r.delivered_at).toBeNull()
    expect(r.attempts).toBe(1)
    expect(r.last_error).toContain(`HTTP ${status}`)
    expect(r.last_error).not.toContain(SECRET)
    expect(secondsUntilNext(id)).toBeGreaterThanOrEqual(6 * 3600 - 2)
    expect(getRelayStatus().lastError).toContain(`HTTP ${status}`)
  })

  it('400 stops the row permanently but carries on with the batch', async () => {
    configure()
    enable()
    let n = 0
    stubFetch(async () => (n++ === 0 ? respond(400, { message: 'invalid payload' }) : respond(202)))
    const bad = seedOutbox()
    const good = seedOutbox()
    expect(await drainNotificationOutbox()).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(row(bad).last_error).toContain('HTTP 400')
    expect(row(bad).delivered_at).toBeNull()
    expect(row(good).delivered_at).not.toBeNull()

    fetchMock.mockClear()
    await drainNotificationOutbox()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a network error and never stores the secret', async () => {
    configure()
    enable()
    stubFetch(async () => { throw new Error(`connect failed for ${SECRET} Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')}`) })
    const id = seedOutbox()
    await drainNotificationOutbox()
    const r = row(id)
    expect(r.last_error).toContain('network error')
    expect(r.last_error).not.toContain(SECRET)
    expect(r.last_error).not.toContain(Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64'))
    expect(r.attempts).toBe(1)
  })

  it('records a timeout as retryable', async () => {
    configure()
    enable()
    stubFetch(async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e })
    const id = seedOutbox()
    await drainNotificationOutbox()
    expect(row(id).last_error).toContain('timed out')
  })

  it('scrubs a secret echoed back in the response body', async () => {
    configure()
    enable()
    stubFetch(async () => respond(500, { message: `bad secret ${SECRET}` }))
    const id = seedOutbox()
    await drainNotificationOutbox()
    expect(row(id).last_error).not.toContain(SECRET)
    expect(JSON.stringify(getRelayStatus())).not.toContain(SECRET)
  })

  it('gives up on a row older than 7 days', async () => {
    configure()
    enable()
    stubFetch(async () => respond(500))
    const id = seedOutbox({ created_at: '2020-01-01 00:00:00' })
    await drainNotificationOutbox()
    expect(row(id).last_error).toMatch(/^gave up after 7 days/)
    fetchMock.mockClear()
    await drainNotificationOutbox()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is re-entrancy guarded', async () => {
    configure()
    enable()
    let release!: (r: Response) => void
    stubFetch(() => new Promise<Response>(resolve => { release = resolve }))
    seedOutbox()
    const first = drainNotificationOutbox()
    await new Promise(r => setTimeout(r, 0))
    expect(await drainNotificationOutbox()).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(respond(202))
    expect(await first).toBe(1)
    // the guard is released afterwards
    seedOutbox()
    stubFetch(async () => respond(202))
    expect(await drainNotificationOutbox()).toBe(1)
  })

  it('sends at most 25 rows per drain', async () => {
    configure()
    enable()
    for (let i = 0; i < 30; i++) seedOutbox()
    expect(await drainNotificationOutbox()).toBe(25)
    expect(fetchMock).toHaveBeenCalledTimes(25)
  })
})

// ─── Status + test event ────────────────────────────────────────────────────

describe('getRelayStatus()', () => {
  it('reports origin + path only, and counts', async () => {
    configure()
    process.env.SSO_NOTIFICATIONS_URL = 'https://user:pw@intake.test/hook?token=abc'
    enable()
    seedOutbox()
    const s = getRelayStatus()
    expect(s).toMatchObject({ configured: true, enabled: true, url: 'https://intake.test/hook', pending: 1, failing: 0, lastError: null, lastDeliveredAt: null })
    stubFetch(async () => respond(202))
    await drainNotificationOutbox()
    expect(getRelayStatus().lastDeliveredAt).toMatch(/^\d{4}-/)
    expect(getRelayStatus().pending).toBe(0)
  })

  it('is unconfigured with no env', () => {
    expect(getRelayStatus()).toMatchObject({ configured: false, enabled: false, url: null })
  })
})

describe('sendTestEvent()', () => {
  it('returns ok:false "not configured" without any fetch', async () => {
    const r = await sendTestEvent()
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/not configured/i)
    expect(r.message).toContain('SSO_CLIENT_SECRET')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a portal_test event directly (not via the outbox)', async () => {
    configure()
    const r = await sendTestEvent()
    expect(r.ok).toBe(true)
    expect(rows()).toHaveLength(0)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe('portal_test')
    expect(body.title).toBe('Test notification from the partner portal')
    expect(body.audience_roles).toEqual(expect.arrayContaining([...DEFAULT_SSO_ROUTING.new_registration]))
  })

  it('falls back to super admin when new_registration routes to nobody', async () => {
    configure()
    setSsoNotifySettings({ routing: { new_registration: [] } })
    await sendTestEvent()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).audience_roles).toEqual(['sliquid_super_admin'])
  })

  it('reports a failure without the secret', async () => {
    configure()
    stubFetch(async () => respond(403, { message: `client ${SECRET} not allowed` }))
    const r = await sendTestEvent()
    expect(r.ok).toBe(false)
    expect(r.message).toContain('HTTP 403')
    expect(r.message).not.toContain(SECRET)
  })
})
