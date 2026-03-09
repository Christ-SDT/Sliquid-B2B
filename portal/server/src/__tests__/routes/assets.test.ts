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

const assetPayload = {
  name: 'Sliquid Logo',
  brand: 'Sliquid',
  type: 'Logo',
  file_url: 'https://example.com/logo.png',
}

describe('GET /api/assets', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/assets')
    expect(res.status).toBe(401)
  })

  it('returns an array when authenticated', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/assets', () => {
  it('creates an asset as admin', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(assetPayload)
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'No type or url' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(assetPayload)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/assets/:id', () => {
  it('updates an asset as admin', async () => {
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(assetPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/assets/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...assetPayload, name: 'Updated Logo' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Logo')
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(assetPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/assets/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ ...assetPayload, name: 'Hacked' })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/assets/:id', () => {
  it('deletes an asset as admin', async () => {
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(assetPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/assets/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(assetPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/assets/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })
})
