import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

afterAll(() => db.close())

const applyPayload = {
  contact_name: 'Jane Doe',
  business_name: 'Test Store',
  address: '123 Main St, City, ST 12345',
  requested_items: 'Counter Cards (Naturals)',
}

describe('POST /api/retailer/apply', () => {
  it('submits a marketing request', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(applyPayload)
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    expect(res.body.id).toBeDefined()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ contact_name: 'Jane Doe' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when requested_items is missing — no selection made', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ contact_name: 'Jane', business_name: 'Store', address: '123 St' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when contact_name is missing', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ business_name: 'Store', address: '123 St', requested_items: 'Counter Cards' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when address is missing', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ contact_name: 'Jane', business_name: 'Store', requested_items: 'Counter Cards' })
    expect(res.status).toBe(400)
  })

  it('accepts submission without optional request_notes', async () => {
    const res = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ ...applyPayload, request_notes: undefined })
    expect(res.status).toBe(201)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/retailer/apply').send(applyPayload)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/retailer/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/retailer/status')
    expect(res.status).toBe(401)
  })

  it('returns null when user has no requests', async () => {
    const res = await request(app)
      .get('/api/retailer/status')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('returns latest request for current user', async () => {
    await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(applyPayload)

    const res = await request(app)
      .get('/api/retailer/status')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.business_name).toBe('Test Store')
    expect(res.body.status).toBe('pending')
  })
})

describe('GET /api/retailer/applications', () => {
  it('returns all applications for admin', async () => {
    await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(applyPayload)

    const res = await request(app)
      .get('/api/retailer/applications')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/retailer/applications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/retailer/applications/:id/status', () => {
  it('returns 404 for unknown application', async () => {
    const res = await request(app)
      .put('/api/retailer/applications/99999/status')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ status: 'approved' })
    expect(res.status).toBe(404)
  })

  it('updates application status as admin', async () => {
    const applyRes = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(applyPayload)
    const id = applyRes.body.id

    const res = await request(app)
      .put(`/api/retailer/applications/${id}/status`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ status: 'approved' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('approved')
  })

  it('returns 400 for invalid status value', async () => {
    const applyRes = await request(app)
      .post('/api/retailer/apply')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(applyPayload)
    const id = applyRes.body.id

    const res = await request(app)
      .put(`/api/retailer/applications/${id}/status`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ status: 'invalid_value' })
    expect(res.status).toBe(400)
  })
})
