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

const itemPayload = {
  name: 'Counter Cards',
  subtitle: 'Point of sale display',
  specs: ['Full color', '5x7 inches'],
  variants: ['Naturals', 'Organics'],
  sort_order: 0,
}

describe('GET /api/marketing-items', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/marketing-items')
    expect(res.status).toBe(401)
  })

  it('parses specs and variants as arrays', async () => {
    await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(itemPayload)

    const res = await request(app)
      .get('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const item = res.body[0]
    expect(Array.isArray(item.specs)).toBe(true)
    expect(Array.isArray(item.variants)).toBe(true)
  })
})

describe('POST /api/marketing-items', () => {
  it('creates a marketing item as admin', async () => {
    const res = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(itemPayload)
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Counter Cards')
    expect(Array.isArray(res.body.variants)).toBe(true)
  })

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ subtitle: 'No name' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(itemPayload)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/marketing-items/:id', () => {
  it('updates a marketing item as admin', async () => {
    const createRes = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(itemPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/marketing-items/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...itemPayload, name: 'Updated Cards' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Cards')
  })
})

describe('DELETE /api/marketing-items/:id', () => {
  it('deletes a marketing item as admin', async () => {
    const createRes = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(itemPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/marketing-items/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/marketing-items')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(itemPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/marketing-items/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })
})
