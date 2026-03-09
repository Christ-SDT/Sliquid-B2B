import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { makeExpiredToken, makeInvalidToken, bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

afterAll(() => db.close())

describe('requireAuth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', 'NotBearer token')
    expect(res.status).toBe(401)
  })

  it('returns 401 for an expired token', async () => {
    const token = makeExpiredToken(adminId, 'tier5')
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('returns 401 for a token signed with the wrong secret', async () => {
    const token = makeInvalidToken(adminId, 'tier5')
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('passes with a valid token', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
  })
})

describe('requireRole middleware', () => {
  it('returns 403 when user does not have the required role', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ name: 'X', brand: 'Y', category: 'Z', sku: 'SKU001', price: 5 })
    expect(res.status).toBe(403)
  })

  it('allows access when user has the required role', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'X', brand: 'Y', category: 'Z', sku: 'SKU002', price: 5 })
    expect(res.status).toBe(201)
  })
})
