import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb } from '../helpers/db.js'

beforeEach(() => resetDb())
afterAll(() => db.close())

const VALID = {
  company: 'Pleasure Chest',
  contactName: 'Dana Reyes',
  email: 'dana@pleasurechest.example',
  phone: '(555) 555-5555',
  pointOfContact: 'Michelle Marcus — VP of Sales',
  brandsCarried: 'Sliquid, RIDE LUBE',
  interests: 'Reorder / place an order, In-store marketing materials',
  siteFeedback: 'Love it',
  comments: 'The new packshots are much easier to use.',
}

describe('POST /api/b2b/retailer-checkin', () => {
  it('accepts a check-in and returns a sequential SRC reference', async () => {
    const res = await request(app).post('/api/b2b/retailer-checkin').send(VALID)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.referenceNumber).toBe('SRC-0001')
  })

  it('persists every submitted field', async () => {
    await request(app).post('/api/b2b/retailer-checkin').send(VALID)
    const row = db.prepare('SELECT * FROM retailer_checkins WHERE email = ?').get(VALID.email) as any
    expect(row.company).toBe(VALID.company)
    expect(row.contact_name).toBe(VALID.contactName)
    expect(row.phone).toBe(VALID.phone)
    expect(row.point_of_contact).toBe(VALID.pointOfContact)
    expect(row.brands_carried).toBe(VALID.brandsCarried)
    expect(row.interests).toBe(VALID.interests)
    expect(row.site_feedback).toBe(VALID.siteFeedback)
    expect(row.comments).toBe(VALID.comments)
  })

  // Sequential, not random hex — the whole reason this endpoint writes a row.
  it('increments the reference number per submission', async () => {
    const a = await request(app).post('/api/b2b/retailer-checkin').send(VALID)
    const b = await request(app).post('/api/b2b/retailer-checkin').send({ ...VALID, email: 'other@shop.example' })
    expect(a.body.referenceNumber).toBe('SRC-0001')
    expect(b.body.referenceNumber).toBe('SRC-0002')
  })

  it('requires no auth — the link is mailed to partners directly', async () => {
    const res = await request(app).post('/api/b2b/retailer-checkin').send(VALID)
    expect(res.status).not.toBe(401)
  })

  describe('validation', () => {
    for (const field of ['company', 'contactName', 'email'] as const) {
      it(`rejects a missing ${field}`, async () => {
        const { [field]: _omit, ...rest } = VALID
        const res = await request(app).post('/api/b2b/retailer-checkin').send(rest)
        expect(res.status).toBe(400)
        expect(db.prepare('SELECT COUNT(*) c FROM retailer_checkins').get()).toEqual({ c: 0 })
      })
    }

    it('rejects a malformed email', async () => {
      const res = await request(app).post('/api/b2b/retailer-checkin').send({ ...VALID, email: 'not-an-email' })
      expect(res.status).toBe(400)
      expect(db.prepare('SELECT COUNT(*) c FROM retailer_checkins').get()).toEqual({ c: 0 })
    })

    it('accepts a check-in with only the three required fields', async () => {
      const res = await request(app).post('/api/b2b/retailer-checkin').send({
        company: 'Corner Shop', contactName: 'Ada L', email: 'ada@corner.example',
      })
      expect(res.status).toBe(200)
      const row = db.prepare('SELECT * FROM retailer_checkins WHERE email = ?').get('ada@corner.example') as any
      expect(row.phone).toBeNull()
      expect(row.point_of_contact).toBeNull()
    })
  })

  describe('duplicate guard', () => {
    it('429s a second submission from the same email within 2 hours', async () => {
      await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      const res = await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      expect(res.status).toBe(429)
      expect(res.body.alreadySubmitted).toBe(true)
      expect(db.prepare('SELECT COUNT(*) c FROM retailer_checkins').get()).toEqual({ c: 1 })
    })

    it('matches case-insensitively — partners retype their address casually', async () => {
      await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      const res = await request(app).post('/api/b2b/retailer-checkin').send({ ...VALID, email: VALID.email.toUpperCase() })
      expect(res.status).toBe(429)
    })

    it('lets the same email through once the window has passed', async () => {
      await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      db.prepare(`UPDATE retailer_checkins SET created_at = datetime('now', '-3 hours')`).run()
      const res = await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      expect(res.status).toBe(200)
      expect(res.body.referenceNumber).toBe('SRC-0002')
    })

    it('does not block a different store at the same moment', async () => {
      await request(app).post('/api/b2b/retailer-checkin').send(VALID)
      const res = await request(app).post('/api/b2b/retailer-checkin').send({ ...VALID, email: 'sam@othershop.example' })
      expect(res.status).toBe(200)
    })
  })
})

describe('CORS on the public B2B intake paths', () => {
  // These are POST-only endpoints called cross-origin from the marketing site.
  // A preflight that omits POST fails in the browser while every supertest
  // request still passes, because supertest sends no Origin and never
  // preflights — so assert the header explicitly.
  const PUBLIC_POST_PATHS = [
    '/api/b2b/contact',
    '/api/b2b/retailer-apply',
    '/api/b2b/retailer-checkin',
    '/api/b2b/hp-apply',
    '/api/b2b/booth-signup',
  ]

  for (const path of PUBLIC_POST_PATHS) {
    it(`advertises POST in the preflight for ${path}`, async () => {
      const res = await request(app)
        .options(path)
        .set('Origin', 'https://hq.sliquid.com')
        .set('Access-Control-Request-Method', 'POST')
      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-methods']).toContain('POST')
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })
  }
})
