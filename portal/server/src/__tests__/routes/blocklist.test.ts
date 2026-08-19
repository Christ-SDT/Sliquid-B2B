import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb } from '../helpers/db.js'
import { resetBlocklistCache, matchBlocklist, loadBlocklist } from '../../blocklist.js'

let dir: string
let file: string

/** Point the loader at a throwaway file so tests never touch the shipped one. */
function useBlocklist(config: Record<string, unknown>) {
  writeFileSync(file, JSON.stringify(config))
  resetBlocklistCache()
}

const DEFAULTS = {
  mode: 'reject',
  repeatLimit: { maxSubmissions: 2, windowDays: 30, scope: 'form', matchOn: 'email-or-name' },
  emails: [], domains: [], names: [], messageContains: [],
}

const CONTACT = {
  fromName: 'Jane Doe', fromEmail: 'jane@store.com',
  subject: 'retailer', message: 'Hello there',
}

beforeEach(() => {
  resetDb()
  dir = mkdtempSync(join(tmpdir(), 'blocklist-'))
  file = join(dir, 'blocklist.json')
  process.env.BLOCKLIST_PATH = file
  useBlocklist(DEFAULTS)
})

afterEach(() => {
  delete process.env.BLOCKLIST_PATH
  resetBlocklistCache()
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => db.close())

describe('blocklist file', () => {
  it('refuses a listed email with 403 and sends nothing', async () => {
    useBlocklist({ ...DEFAULTS, emails: ['jane@store.com'] })
    const res = await request(app).post('/api/b2b/contact').send(CONTACT)
    expect(res.status).toBe(403)
    expect(res.body.blocked).toBe(true)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
  })

  it('matches the listed email case-insensitively and ignores whitespace', async () => {
    useBlocklist({ ...DEFAULTS, emails: ['  JANE@STORE.COM  '] })
    const res = await request(app).post('/api/b2b/contact').send(CONTACT)
    expect(res.status).toBe(403)
  })

  it('refuses a whole domain', async () => {
    useBlocklist({ ...DEFAULTS, domains: ['store.com'] })
    const res = await request(app).post('/api/b2b/contact').send(CONTACT)
    expect(res.status).toBe(403)
  })

  it('accepts a leading @ on a domain entry', async () => {
    useBlocklist({ ...DEFAULTS, domains: ['@store.com'] })
    const res = await request(app).post('/api/b2b/contact').send(CONTACT)
    expect(res.status).toBe(403)
  })

  it('refuses a listed name even from a fresh address', async () => {
    useBlocklist({ ...DEFAULTS, names: ['jane doe'] })
    const res = await request(app).post('/api/b2b/contact')
      .send({ ...CONTACT, fromEmail: 'brand-new@elsewhere.example' })
    expect(res.status).toBe(403)
  })

  it('refuses on a phrase in the message body', async () => {
    useBlocklist({ ...DEFAULTS, messageContains: ['crypto investment'] })
    const res = await request(app).post('/api/b2b/contact')
      .send({ ...CONTACT, fromEmail: 'someone@ok.example', fromName: 'Someone', message: 'Great CRYPTO INVESTMENT offer' })
    expect(res.status).toBe(403)
  })

  it('lets everyone else through', async () => {
    useBlocklist({ ...DEFAULTS, emails: ['jane@store.com'] })
    const res = await request(app).post('/api/b2b/contact')
      .send({ ...CONTACT, fromEmail: 'real@retailer.example', fromName: 'Real Buyer' })
    expect(res.status).toBe(200)
  })

  it('never reveals which rule matched', async () => {
    useBlocklist({ ...DEFAULTS, emails: ['jane@store.com'] })
    const res = await request(app).post('/api/b2b/contact').send(CONTACT)
    const body = JSON.stringify(res.body).toLowerCase()
    expect(body).not.toContain('jane@store.com')
    expect(body).not.toContain('blocklist')
    // ...but it does give a wrongly-blocked human a way through.
    expect(body).toContain('sales@sliquid.com')
  })

  it('applies to every public form, not just contact', async () => {
    useBlocklist({ ...DEFAULTS, emails: ['jane@store.com'] })
    const calls = [
      request(app).post('/api/b2b/retailer-apply').send({ company: 'S', contactName: 'Jane Doe', email: 'jane@store.com', phone: '5', brands: 'Sliquid' }),
      request(app).post('/api/b2b/retailer-checkin').send({ company: 'S', contactName: 'Jane Doe', email: 'jane@store.com' }),
      request(app).post('/api/b2b/hp-apply').send({ practiceType: 'C', practiceName: 'C', contactName: 'Jane Doe', contactPhone: '5', email: 'jane@store.com' }),
      request(app).post('/api/b2b/booth-signup').send({ name: 'Jane Doe', email: 'jane@store.com', businessName: 'S', businessType: 'Retailer', contactName: 'Jane Doe' }),
      request(app).post('/api/gdpr/request').send({ type: 'access', name: 'Jane Doe', email: 'jane@store.com' }),
    ]
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403)
  })

  describe('silent mode', () => {
    it('returns a normal success but does nothing', async () => {
      useBlocklist({ ...DEFAULTS, mode: 'silent', emails: ['jane@store.com'] })
      const res = await request(app).post('/api/b2b/contact').send(CONTACT)
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
    })
  })

  describe('a broken file must not take the forms down', () => {
    it('falls open when the JSON is malformed', async () => {
      writeFileSync(file, '{ this is not json')
      resetBlocklistCache()
      const res = await request(app).post('/api/b2b/contact').send(CONTACT)
      expect(res.status).toBe(200)
    })

    it('falls open when the file is missing', async () => {
      process.env.BLOCKLIST_PATH = join(dir, 'does-not-exist.json')
      resetBlocklistCache()
      const res = await request(app).post('/api/b2b/contact').send(CONTACT)
      expect(res.status).toBe(200)
    })

    it('clamps a maxSubmissions of 0, which would otherwise block everyone', async () => {
      useBlocklist({ ...DEFAULTS, repeatLimit: { ...DEFAULTS.repeatLimit, maxSubmissions: 0 } })
      expect(loadBlocklist().repeatLimit.maxSubmissions).toBe(1)
      const res = await request(app).post('/api/b2b/contact').send(CONTACT)
      expect(res.status).toBe(200)
    })
  })

  it('picks up an edit without a restart', async () => {
    const first = await request(app).post('/api/b2b/contact')
      .send({ ...CONTACT, fromEmail: 'a@ok.example', fromName: 'A' })
    expect(first.status).toBe(200)

    useBlocklist({ ...DEFAULTS, emails: ['b@ok.example'] })
    const second = await request(app).post('/api/b2b/contact')
      .send({ ...CONTACT, fromEmail: 'b@ok.example', fromName: 'B' })
    expect(second.status).toBe(403)
  })

  it('matchBlocklist reports the matched rule for the server log only', () => {
    const list = { ...DEFAULTS, domains: ['spam.example'] } as any
    expect(matchBlocklist({ email: 'x@spam.example' }, list)).toBe('domain:spam.example')
    expect(matchBlocklist({ email: 'x@fine.example' }, list)).toBeNull()
  })
})

describe('repeat limit', () => {
  // Distinct emails/names per case so the identity match does not bleed across.
  async function send(n: number, over: Partial<typeof CONTACT> = {}) {
    return request(app).post('/api/b2b/contact').send({ ...CONTACT, ...over, message: `msg ${n}` })
  }

  it('allows the first two and refuses the third', async () => {
    expect((await send(1)).status).toBe(200)
    // Clear the hourly cooldown so this test exercises the repeat limit, not it.
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    expect((await send(2)).status).toBe(200)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()

    const third = await send(3)
    expect(third.status).toBe(403)
    expect(third.body.blocked).toBe(true)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 2 })
  })

  it('counts a rotated email when the name stays the same', async () => {
    await send(1, { fromEmail: 'jane1@a.example' })
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2, { fromEmail: 'jane2@b.example' })
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()

    const third = await send(3, { fromEmail: 'jane3@c.example' })
    expect(third.status).toBe(403)
  })

  it("does not count a name match when matchOn is 'email'", async () => {
    useBlocklist({ ...DEFAULTS, repeatLimit: { ...DEFAULTS.repeatLimit, matchOn: 'email' } })
    await send(1, { fromEmail: 'jane1@a.example' })
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2, { fromEmail: 'jane2@b.example' })
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()

    const third = await send(3, { fromEmail: 'jane3@c.example' })
    expect(third.status).toBe(200)
  })

  it('scopes the count to one form by default', async () => {
    await send(1)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()

    // Contact is used up; a different form is still open.
    expect((await send(3)).status).toBe(403)
    const other = await request(app).post('/api/b2b/retailer-checkin')
      .send({ company: 'S', contactName: 'Jane Doe', email: 'jane@store.com' })
    expect(other.status).toBe(200)
  })

  it("scope 'all' counts across every form", async () => {
    useBlocklist({ ...DEFAULTS, repeatLimit: { ...DEFAULTS.repeatLimit, scope: 'all' } })
    await send(1)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()

    const other = await request(app).post('/api/b2b/retailer-checkin')
      .send({ company: 'S', contactName: 'Jane Doe', email: 'jane@store.com' })
    expect(other.status).toBe(403)
  })

  // Both of these must age the rows BETWEEN sends, or the hourly cooldown
  // refuses the second one and only a single row is ever recorded — which
  // makes the window assertion pass for entirely the wrong reason.
  it('forgets submissions older than the window', async () => {
    await send(1)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 2 })

    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-31 days')`).run()
    expect((await send(3)).status).toBe(200)
  })

  it('windowDays 0 means forever', async () => {
    useBlocklist({ ...DEFAULTS, repeatLimit: { ...DEFAULTS.repeatLimit, windowDays: 0 } })
    await send(1)
    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-2 hours')`).run()
    await send(2)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 2 })

    db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-10 years')`).run()
    expect((await send(3)).status).toBe(403)
  })

  it('does not count a submission that failed to send', async () => {
    // No rows are written on failure, so nothing accrues — covered end-to-end
    // in form-gate-send-failure.test.ts; asserted here at the counter level.
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
    const res = await request(app).post('/api/b2b/contact').send({ ...CONTACT, fromEmail: 'bad' })
    expect(res.status).toBe(400)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
  })
})
