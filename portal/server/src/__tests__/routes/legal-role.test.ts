import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import {
  db,
  resetDb,
  seedTestUsers,
  seedLegalUser,
  seedCertificate,
  seedCertReward,
  seedPackshot,
} from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number
let tier2Id: number
let legalId: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id } = seedTestUsers())
  legalId = seedLegalUser()
})

afterAll(() => db.close())

// ─── Reads: tier8 (Legal) gets 200 on the converted admin GETs ──────────────

describe('Legal (tier8) — reads', () => {
  const READS: Array<[string, string]> = [
    ['GET', '/api/admin/users'],
    ['GET', '/api/media/packshots'],
    ['GET', '/api/gdpr/requests'],
    ['GET', '/api/certificates/rewards'],
    ['GET', '/api/retailer/applications'],
  ]

  it.each(READS)('%s %s returns 200 for tier8', async (method, url) => {
    const res = await (request(app) as any)[method.toLowerCase()](url)
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(200)
  })

  it.each(READS)('%s %s returns 403 for tier1 (widening to Legal did not widen to everyone)', async (method, url) => {
    const res = await (request(app) as any)[method.toLowerCase()](url)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it.each(READS)('%s %s still returns 200 for tier5/admin', async (method, url) => {
    const res = await (request(app) as any)[method.toLowerCase()](url)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
  })
})

// ─── Writes: tier8 gets 403 everywhere, and the guard runs BEFORE the write ─

describe('Legal (tier8) — writes are rejected, and rejected before touching the DB', () => {
  it('PUT /api/admin/users/:id/role returns 403 for tier8 and the role is unchanged', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${tier1Id}/role`)
      .send({ role: 'tier5' })
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(tier1Id) as any
    expect(row.role).toBe('tier1')
  })

  it('DELETE /api/admin/users/:id returns 403 for tier8 and the user still exists', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${tier1Id}`)
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(tier1Id) as any
    expect(row).toBeTruthy()
  })

  it('POST /api/assets returns 403 for tier8 and no asset row is created', async () => {
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'Sneaky Asset', brand: 'Sliquid', type: 'Logo', file_url: 'https://example.com/x.png' })
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM assets').get() as { c: number }).c
    expect(count).toBe(0)
  })

  it('PUT /api/media/packshots/:id/approved returns 403 for tier8 and approval is unchanged', async () => {
    const packshot = seedPackshot({ approved: 1 })
    const res = await request(app)
      .put(`/api/media/packshots/${packshot.id}/approved`)
      .send({ approved: false })
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const row = db.prepare('SELECT approved FROM media WHERE id = ?').get(packshot.id) as any
    expect(row.approved).toBe(1)
  })

  it('PUT /api/certificates/rewards/:id/fulfilled returns 403 for tier8 and fulfilled is unchanged', async () => {
    seedCertificate(tier1Id, 'Tier1 User')
    const rewardId = seedCertReward(tier1Id)

    const res = await request(app)
      .put(`/api/certificates/rewards/${rewardId}/fulfilled`)
      .send({ fulfilled: true })
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const row = db.prepare('SELECT fulfilled FROM cert_rewards WHERE id = ?').get(rewardId) as any
    expect(row.fulfilled).toBe(0)
  })

  it('POST /api/distributors returns 403 for tier8 and no distributor row is created', async () => {
    const res = await request(app)
      .post('/api/distributors')
      .send({ name: 'Sneaky Distributor', region: 'US', state: 'TX' })
      .set('Authorization', bearerToken(legalId, 'tier8'))
    expect(res.status).toBe(403)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM distributors').get() as { c: number }).c
    expect(count).toBe(0)
  })
})

// ─── tier5/admin is unaffected — nothing was broken by adding tier8 ─────────

describe('tier5/admin — unaffected by the Legal role addition', () => {
  it('PUT /api/admin/users/:id/role still works for an admin', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${tier1Id}/role`)
      .send({ role: 'tier2' })
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)

    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(tier1Id) as any
    expect(row.role).toBe('tier2')
  })

  it('POST /api/distributors still works for an admin', async () => {
    const res = await request(app)
      .post('/api/distributors')
      // `state` is required here even though the route's own validation only checks
      // name/region — `distributors.state` is NOT NULL in the schema and the route
      // does `state ?? null`, so omitting it 500s. Pre-existing production bug,
      // out of scope for this test file — see the final report.
      .send({ name: 'Real Distributor', region: 'US', state: 'TX' })
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(201)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM distributors').get() as { c: number }).c
    expect(count).toBe(1)
  })
})

// ─── GET /api/store/members — the one hand-rolled canViewAdmin bypass site ──

describe('GET /api/store/members — canViewAdmin bypass', () => {
  it('tier8 (Legal) sees users across every company, not just their own', async () => {
    // seedTestUsers() already gives tier1Id + tier2Id company 'Demo Store'.
    // Add a user in a different company so "sees all companies" is a real assertion.
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, company, status) VALUES ('Other Store User', 'other@test.com', 'x', 'tier3', 'Other Store LLC', 'active')"
    ).run()

    const res = await request(app)
      .get('/api/store/members')
      .set('Authorization', bearerToken(legalId, 'tier8'))

    expect(res.status).toBe(200)
    const companies = new Set((res.body as any[]).map(u => u.company))
    expect(companies.has('Demo Store')).toBe(true)
    expect(companies.has('Other Store LLC')).toBe(true)
  })

  it('tier2 is still scoped to only their own company', async () => {
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role, company, status) VALUES ('Other Store User', 'other@test.com', 'x', 'tier3', 'Other Store LLC', 'active')"
    ).run()

    const res = await request(app)
      .get('/api/store/members')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))

    expect(res.status).toBe(200)
    const companies = new Set((res.body as any[]).map(u => u.company))
    expect(companies.has('Other Store LLC')).toBe(false)
    for (const c of companies) expect(c).toBe('Demo Store')
  })

  it('tier1 is still rejected outright — Legal did not widen tier1 access', async () => {
    const res = await request(app)
      .get('/api/store/members')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })
})
