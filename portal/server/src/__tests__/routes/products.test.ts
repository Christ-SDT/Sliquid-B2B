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

const productPayload = { name: 'H2O 4oz', brand: 'Sliquid', category: 'Water-Based', sku: 'H2O001', price: 7 }

describe('GET /api/products', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(401)
  })

  it('returns an array when authenticated', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/products', () => {
  it('creates a product as admin', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(productPayload)
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'Missing fields' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(productPayload)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/products/:id', () => {
  it('returns a product by ID', async () => {
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(productPayload)

    const res = await request(app)
      .get(`/api/products/${createRes.body.id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('H2O 4oz')
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .get('/api/products/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })
})
