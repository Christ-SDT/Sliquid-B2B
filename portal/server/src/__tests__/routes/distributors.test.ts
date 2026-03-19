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

const distPayload = {
  name: 'Test Distributor',
  region: 'US',
  state: 'TX, OK',
  city: 'Dallas',
  address: '123 Main St',
  contact_name: 'Jane Doe',
  phone: '555-1234',
  email: 'jane@testdist.com',
  website: 'https://testdist.com',
  notes: null,
}

describe('GET /api/distributors', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/distributors')
    expect(res.status).toBe(401)
  })

  it('returns a list when authenticated', async () => {
    const res = await request(app)
      .get('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('filters by region', async () => {
    await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)

    await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...distPayload, name: 'Canada Dist', region: 'Canada', state: 'BC' })

    const res = await request(app)
      .get('/api/distributors?region=Canada')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.every((d: any) => d.region.includes('Canada'))).toBe(true)
  })
})

describe('POST /api/distributors', () => {
  it('creates a distributor as admin', async () => {
    const res = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Test Distributor')
    expect(res.body.region).toBe('US')
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ region: 'US' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when region is missing', async () => {
    const res = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'No Region' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(distPayload)
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/distributors').send(distPayload)
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/distributors/:id', () => {
  it('updates a distributor as admin', async () => {
    const createRes = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/distributors/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...distPayload, name: 'Updated Distributor' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Distributor')
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .put('/api/distributors/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    expect(res.status).toBe(404)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/distributors/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ ...distPayload, name: 'Hacked' })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/distributors/:id', () => {
  it('deletes a distributor as admin', async () => {
    const createRes = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/distributors/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .delete('/api/distributors/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/distributors')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(distPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/distributors/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/distributors/1')
    expect(res.status).toBe(401)
  })
})
