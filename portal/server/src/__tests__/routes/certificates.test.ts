import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import {
  db,
  resetDb,
  seedTestUsers,
  seedCertificate,
  seedCertReward,
} from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

const VALID_REWARD = {
  product: 'Sliquid H2O',
  shirtSize: 'M',
  address1: '123 Main St',
  address2: 'Apt 4',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
}

let adminId: number
let tier1Id: number
let tier1Name: string

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
  tier1Name = 'Tier1 User'
})

afterAll(() => db.close())

// ─── GET /api/certificates/mine ──────────────────────────────────────────────

describe('GET /api/certificates/mine', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/certificates/mine')
    expect(res.status).toBe(401)
  })

  it('returns 404 when the user has no certificate', async () => {
    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no certificate/i)
  })

  it('returns certificate data with correct shape', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name)

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body.certificateNumber).toBe(certNumber)
    expect(res.body.firstName).toBe('Tier1')
    expect(res.body.lastName).toBe('User')
    expect(typeof res.body.completionDate).toBe('string')
    expect(res.body.completionDate.length).toBeGreaterThan(0)
  })

  it('returns rewardSubmitted: false when no reward has been submitted', async () => {
    seedCertificate(tier1Id, tier1Name)

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body.rewardSubmitted).toBe(false)
  })

  it('returns rewardSubmitted: true after a reward has been submitted', async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertReward(tier1Id)

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body.rewardSubmitted).toBe(true)
  })

  it("only returns the requesting user's own certificate", async () => {
    seedCertificate(adminId, 'Test Admin', 'SLQ-2025-ADMIN1')

    // tier1 has no cert — should still 404
    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
  })

  it('does not return a revoked (is_valid=0) certificate', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name)
    db.prepare('UPDATE certificates SET is_valid = 0 WHERE certificate_number = ?').run(certNumber)

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/certificates/reward ───────────────────────────────────────────

describe('POST /api/certificates/reward', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/certificates/reward')
      .send(VALID_REWARD)
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user has no valid certificate', async () => {
    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(VALID_REWARD)
    expect(res.status).toBe(403)
  })

  it('returns 400 when product is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { product: _p, ...noProduct } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noProduct)
    expect(res.status).toBe(400)
  })

  it('returns 400 when shirtSize is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { shirtSize: _s, ...noSize } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noSize)
    expect(res.status).toBe(400)
  })

  it('returns 400 when address1 is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { address1: _a, ...noAddr } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noAddr)
    expect(res.status).toBe(400)
  })

  it('returns 400 when city is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { city: _c, ...noCity } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noCity)
    expect(res.status).toBe(400)
  })

  it('returns 400 when state is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { state: _st, ...noState } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noState)
    expect(res.status).toBe(400)
  })

  it('returns 400 when zip is missing', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { zip: _z, ...noZip } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noZip)
    expect(res.status).toBe(400)
  })

  it('returns 201 and saves the reward on a valid submission', async () => {
    seedCertificate(tier1Id, tier1Name)

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(VALID_REWARD)

    expect(res.status).toBe(201)

    // Confirm row was written to DB
    const row = db.prepare('SELECT * FROM cert_rewards WHERE user_id = ?').get(tier1Id) as any
    expect(row).toBeTruthy()
    expect(row.product).toBe(VALID_REWARD.product)
    expect(row.shirt_size).toBe(VALID_REWARD.shirtSize)
    expect(row.address1).toBe(VALID_REWARD.address1)
    expect(row.address2).toBe(VALID_REWARD.address2)
    expect(row.city).toBe(VALID_REWARD.city)
    expect(row.state).toBe(VALID_REWARD.state)
    expect(row.zip).toBe(VALID_REWARD.zip)
    expect(row.full_name).toBe(tier1Name)
  })

  it('address2 is optional — succeeds without it', async () => {
    seedCertificate(tier1Id, tier1Name)
    const { address2: _a2, ...noAddr2 } = VALID_REWARD

    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(noAddr2)

    expect(res.status).toBe(201)
    const row = db.prepare('SELECT address2 FROM cert_rewards WHERE user_id = ?').get(tier1Id) as any
    expect(row.address2).toBeNull()
  })

  it('is idempotent — second submission returns 200 without creating a duplicate', async () => {
    seedCertificate(tier1Id, tier1Name)

    // First submission
    await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(VALID_REWARD)

    // Second submission (different product)
    const res = await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ ...VALID_REWARD, product: 'Sliquid Sea' })

    expect(res.status).toBe(200)

    // Only one row in DB, original product preserved
    const rows = db.prepare('SELECT * FROM cert_rewards WHERE user_id = ?').all(tier1Id) as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].product).toBe(VALID_REWARD.product)
  })

  it('different users can each submit their own reward independently', async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertificate(adminId, 'Test Admin', 'SLQ-2025-ADMIN1')

    await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(VALID_REWARD)

    await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...VALID_REWARD, product: 'Sliquid Sea' })

    const rows = db.prepare('SELECT user_id, product FROM cert_rewards ORDER BY user_id').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.user_id === tier1Id)?.product).toBe(VALID_REWARD.product)
    expect(rows.find(r => r.user_id === adminId)?.product).toBe('Sliquid Sea')
  })

  it('submission causes GET /mine to return rewardSubmitted: true', async () => {
    seedCertificate(tier1Id, tier1Name)

    // Before
    const before = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(before.body.rewardSubmitted).toBe(false)

    // Submit reward
    await request(app)
      .post('/api/certificates/reward')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(VALID_REWARD)

    // After
    const after = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(after.body.rewardSubmitted).toBe(true)
  })
})

// ─── GET /api/certificates/verify/:certNumber ────────────────────────────────

describe('GET /api/certificates/verify/:certNumber', () => {
  it('returns 404 for an unknown certificate number', async () => {
    const res = await request(app).get('/api/certificates/verify/SLQ-9999-XXXXXX')
    expect(res.status).toBe(404)
    expect(res.body.valid).toBe(false)
  })

  it('returns 404 for a revoked certificate', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name)
    db.prepare('UPDATE certificates SET is_valid = 0 WHERE certificate_number = ?').run(certNumber)

    const res = await request(app).get(`/api/certificates/verify/${certNumber}`)
    expect(res.status).toBe(404)
    expect(res.body.valid).toBe(false)
  })

  it('returns valid: true with full details for a real certificate', async () => {
    seedCertificate(tier1Id, tier1Name, 'SLQ-2025-ABCDEF')

    const res = await request(app).get('/api/certificates/verify/SLQ-2025-ABCDEF')
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
    expect(res.body.certificateNumber).toBe('SLQ-2025-ABCDEF')
    expect(res.body.fullName).toBe('Tier1 User')
    expect(res.body.firstName).toBe('Tier1')
    expect(res.body.lastName).toBe('User')
    expect(typeof res.body.completionDate).toBe('string')
  })

  it('is publicly accessible — no auth token required', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name)
    const res = await request(app).get(`/api/certificates/verify/${certNumber}`)
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
  })

  it('cert number lookup is case-sensitive', async () => {
    seedCertificate(tier1Id, tier1Name, 'SLQ-2025-ABCDEF')

    const res = await request(app).get('/api/certificates/verify/slq-2025-abcdef')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/certificates/rewards', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/certificates/rewards')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin tier — reward rows contain shipping PII', async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertReward(tier1Id)

    const res = await request(app)
      .get('/api/certificates/rewards')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(403)
  })

  it('returns the reward list for an admin', async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertReward(tier1Id)

    const res = await request(app)
      .get('/api/certificates/rewards')
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].address1).toBeTruthy()
  })
})

describe('POST /api/certificates/test/ensure', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/certificates/test/ensure').send({})
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin tier', async () => {
    const res = await request(app)
      .post('/api/certificates/test/ensure')
      .send({})
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(403)

    const rows = db.prepare('SELECT id FROM certificates WHERE user_id = ?').all(tier1Id) as any[]
    expect(rows).toHaveLength(0)
  })

  it('issues a certificate for an admin who has none', async () => {
    const res = await request(app)
      .post('/api/certificates/test/ensure')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(201)
    expect(res.body.created).toBe(true)
    expect(res.body.certificateNumber).toMatch(/^SLQ-\d{4}-[A-F0-9]{6}$/)

    const row = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(adminId) as any
    expect(row.certificate_number).toBe(res.body.certificateNumber)
    expect(row.issued_to).toBeTruthy()
    expect(row.is_valid).toBe(1)
  })

  it('is idempotent — reuses the existing certificate instead of issuing a second', async () => {
    const { certNumber } = seedCertificate(adminId, 'Admin User')

    const res = await request(app)
      .post('/api/certificates/test/ensure')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.created).toBe(false)
    expect(res.body.certificateNumber).toBe(certNumber)

    const rows = db.prepare('SELECT id FROM certificates WHERE user_id = ?').all(adminId) as any[]
    expect(rows).toHaveLength(1)
  })

  it('makes GET /mine succeed for an admin who has not passed any quizzes', async () => {
    await request(app)
      .post('/api/certificates/test/ensure')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.rewardSubmitted).toBe(false)
  })
})

describe('POST /api/certificates/test/reset', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/certificates/test/reset').send({})
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin tier', async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertReward(tier1Id)

    const res = await request(app)
      .post('/api/certificates/test/reset')
      .send({})
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(403)

    const rows = db.prepare('SELECT id FROM cert_rewards WHERE user_id = ?').all(tier1Id) as any[]
    expect(rows).toHaveLength(1)
  })

  it("clears the admin's own reward row so the prompt shows again", async () => {
    seedCertificate(adminId, 'Admin User')
    seedCertReward(adminId)

    const res = await request(app)
      .post('/api/certificates/test/reset')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(1)

    const mine = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(mine.body.rewardSubmitted).toBe(false)
  })

  it('leaves the certificate row intact — a real certificate survives a reset', async () => {
    const { certNumber } = seedCertificate(adminId, 'Admin User')
    seedCertReward(adminId)

    await request(app)
      .post('/api/certificates/test/reset')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const row = db.prepare('SELECT certificate_number, is_valid FROM certificates WHERE user_id = ?').get(adminId) as any
    expect(row.certificate_number).toBe(certNumber)
    expect(row.is_valid).toBe(1)
  })

  it("does not touch another user's reward row", async () => {
    seedCertificate(tier1Id, tier1Name)
    seedCertReward(tier1Id)
    seedCertificate(adminId, 'Admin User')
    seedCertReward(adminId)

    await request(app)
      .post('/api/certificates/test/reset')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const others = db.prepare('SELECT id FROM cert_rewards WHERE user_id = ?').all(tier1Id) as any[]
    expect(others).toHaveLength(1)
  })

  it('is a no-op when there is nothing to reset', async () => {
    seedCertificate(adminId, 'Admin User')

    const res = await request(app)
      .post('/api/certificates/test/reset')
      .send({})
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(0)
  })
})

describe('PUT /api/certificates/rewards/:id/fulfilled', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .put('/api/certificates/rewards/1/fulfilled')
      .send({ fulfilled: true })
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin tier', async () => {
    seedCertificate(tier1Id, tier1Name)
    const rewardId = seedCertReward(tier1Id)

    const res = await request(app)
      .put(`/api/certificates/rewards/${rewardId}/fulfilled`)
      .send({ fulfilled: true })
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(403)

    const row = db.prepare('SELECT fulfilled FROM cert_rewards WHERE id = ?').get(rewardId) as any
    expect(row.fulfilled).toBe(0)
  })

  it('lets an admin mark a reward fulfilled', async () => {
    seedCertificate(tier1Id, tier1Name)
    const rewardId = seedCertReward(tier1Id)

    const res = await request(app)
      .put(`/api/certificates/rewards/${rewardId}/fulfilled`)
      .send({ fulfilled: true })
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)

    const row = db.prepare('SELECT fulfilled, fulfilled_at FROM cert_rewards WHERE id = ?').get(rewardId) as any
    expect(row.fulfilled).toBe(1)
    expect(row.fulfilled_at).toBeTruthy()
  })
})
