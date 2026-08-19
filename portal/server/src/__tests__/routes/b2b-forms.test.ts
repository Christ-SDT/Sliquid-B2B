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
      // The clock lives in form_submissions now — ageing retailer_checkins
      // would not move it, which is exactly what this test caught.
      db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-61 minutes')`).run()
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

// ─── Shared one-hour submission gate ─────────────────────────────────────────

describe('one-hour submission gate', () => {
  // Every public intake form, its minimum valid payload, and the field the
  // gate keys on. Driving the suite off this table means a newly added form
  // that forgets the gate has to be added here to pass — or it isn't covered.
  const FORMS = [
    {
      name: 'contact',
      path: '/api/b2b/contact',
      table: null,
      payload: { fromName: 'Ann', fromEmail: 'ann@shop.example', subject: 'retailer', message: 'Hi' },
      emailField: 'fromEmail',
      okStatus: 200,
    },
    {
      name: 'retailer-apply',
      path: '/api/b2b/retailer-apply',
      table: null,
      payload: { company: 'Shop', contactName: 'Ann', email: 'ann@shop.example', phone: '555', brands: 'Sliquid' },
      emailField: 'email',
      okStatus: 200,
    },
    {
      name: 'hp-apply',
      path: '/api/b2b/hp-apply',
      table: 'hp_applications',
      payload: { practiceType: 'Clinic', practiceName: 'C', contactName: 'Ann', contactPhone: '555', email: 'ann@shop.example' },
      emailField: 'email',
      okStatus: 200,
    },
    {
      name: 'retailer-checkin',
      path: '/api/b2b/retailer-checkin',
      table: 'retailer_checkins',
      payload: { company: 'Shop', contactName: 'Ann', email: 'ann@shop.example' },
      emailField: 'email',
      okStatus: 200,
    },
    {
      name: 'booth-signup',
      path: '/api/b2b/booth-signup',
      table: null,
      payload: { name: 'Ann', email: 'ann@shop.example', businessName: 'Shop', businessType: 'Retailer', contactName: 'Ann' },
      emailField: 'email',
      okStatus: 200,
    },
    {
      name: 'gdpr-request',
      path: '/api/gdpr/request',
      table: 'gdpr_requests',
      payload: { type: 'access', name: 'Ann', email: 'ann@shop.example' },
      emailField: 'email',
      okStatus: 201,
    },
  ] as const

  for (const form of FORMS) {
    describe(form.name, () => {
      it('accepts the first submission', async () => {
        const res = await request(app).post(form.path).send(form.payload)
        expect(res.status).toBe(form.okStatus)
      })

      it('429s an immediate resubmission from the same email', async () => {
        await request(app).post(form.path).send(form.payload)
        const res = await request(app).post(form.path).send(form.payload)
        expect(res.status).toBe(429)
        expect(res.body.alreadySubmitted).toBe(true)
        expect(res.body.retryAfterMinutes).toBeGreaterThan(0)
        expect(res.body.retryAfterMinutes).toBeLessThanOrEqual(60)
      })

      it('matches the email case-insensitively', async () => {
        await request(app).post(form.path).send(form.payload)
        const upper = { ...form.payload, [form.emailField]: (form.payload as any)[form.emailField].toUpperCase() }
        const res = await request(app).post(form.path).send(upper)
        expect(res.status).toBe(429)
      })

      it('lets a different email through immediately', async () => {
        await request(app).post(form.path).send(form.payload)
        const other = { ...form.payload, [form.emailField]: 'someone.else@other.example' }
        const res = await request(app).post(form.path).send(other)
        expect(res.status).toBe(form.okStatus)
      })

      it('lets the same email back in once the hour has passed', async () => {
        await request(app).post(form.path).send(form.payload)
        db.prepare(`UPDATE form_submissions SET created_at = datetime('now', '-61 minutes')`).run()
        const res = await request(app).post(form.path).send(form.payload)
        expect(res.status).toBe(form.okStatus)
      })

      if (form.table) {
        it('writes no row while blocked', async () => {
          await request(app).post(form.path).send(form.payload)
          const before = db.prepare(`SELECT COUNT(*) c FROM ${form.table}`).get() as { c: number }
          await request(app).post(form.path).send(form.payload)
          const after = db.prepare(`SELECT COUNT(*) c FROM ${form.table}`).get() as { c: number }
          expect(after.c).toBe(before.c)
        })
      }
    })
  }

  it('keys the window per form, not per email', async () => {
    // Contacting sales must not block a retailer application from the same person.
    await request(app).post('/api/b2b/contact')
      .send({ fromName: 'Ann', fromEmail: 'ann@shop.example', subject: 'retailer', message: 'Hi' })
    const res = await request(app).post('/api/b2b/retailer-apply')
      .send({ company: 'Shop', contactName: 'Ann', email: 'ann@shop.example', phone: '555', brands: 'Sliquid' })
    expect(res.status).toBe(200)
  })

  it('does not let a GDPR access request block a deletion request', async () => {
    // Two distinct legal rights that happen to share one form.
    const a = await request(app).post('/api/gdpr/request')
      .send({ type: 'access', name: 'Ann', email: 'ann@shop.example' })
    const d = await request(app).post('/api/gdpr/request')
      .send({ type: 'deletion', name: 'Ann', email: 'ann@shop.example' })
    expect(a.status).toBe(201)
    expect(d.status).toBe(201)
  })

  it('records nothing when validation rejects the submission', async () => {
    await request(app).post('/api/b2b/retailer-checkin').send({ company: 'X', contactName: 'Y', email: 'bad' })
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
  })

  it('leaves auth flows ungated — a reset lockout is worse than a duplicate', async () => {
    // forgot-password always returns ok:true (no enumeration); the point is
    // that a second attempt is not refused.
    const body = { email: 'nobody@example.com' }
    await request(app).post('/api/auth/forgot-password').send(body)
    const res = await request(app).post('/api/auth/forgot-password').send(body)
    expect(res.status).not.toBe(429)
  })
})
