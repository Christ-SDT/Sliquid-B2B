import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import {
  db,
  resetDb,
  seedTestUsers,
  seedCertificate,
} from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number
let tier1Name: string

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
  // tier1 user name from seedTestUsers
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

  it('returns certificate data for the current user', async () => {
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

  it("only returns the requesting user's own certificate (not another user's)", async () => {
    // Seed cert for admin only
    seedCertificate(adminId, 'Test Admin', 'SLQ-2025-ADMIN1')

    // tier1 has no cert → should still 404
    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
  })

  it('does not return a revoked (is_valid=0) certificate', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name)
    // Revoke it
    db.prepare('UPDATE certificates SET is_valid = 0 WHERE certificate_number = ?').run(certNumber)

    const res = await request(app)
      .get('/api/certificates/mine')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
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

  it('returns valid=true with full details for a real certificate', async () => {
    const { certNumber } = seedCertificate(tier1Id, tier1Name, 'SLQ-2025-ABCDEF')

    const res = await request(app).get(`/api/certificates/verify/SLQ-2025-ABCDEF`)
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
    // No Authorization header
    const res = await request(app).get(`/api/certificates/verify/${certNumber}`)
    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
  })
})
