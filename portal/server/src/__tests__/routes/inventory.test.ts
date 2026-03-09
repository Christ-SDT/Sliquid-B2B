import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedInventoryItem } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number

beforeEach(() => {
  resetDb()
  ;({ adminId } = seedTestUsers())
})

afterAll(() => db.close())

describe('GET /api/inventory', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/inventory')
    expect(res.status).toBe(401)
  })

  it('returns an array when authenticated', async () => {
    seedInventoryItem()
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })
})

describe('PUT /api/inventory/:id/quantity', () => {
  it('updates quantity and recalculates status', async () => {
    const id = seedInventoryItem({ quantity: 10, reorder_level: 5 })

    const res = await request(app)
      .put(`/api/inventory/${id}/quantity`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ quantity: 3 })
    expect(res.status).toBe(200)
    expect(res.body.quantity).toBe(3)
    expect(res.body.status).toBe('low_stock')
  })

  it('sets status to out_of_stock when quantity is 0', async () => {
    const id = seedInventoryItem({ quantity: 10 })

    const res = await request(app)
      .put(`/api/inventory/${id}/quantity`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ quantity: 0 })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('out_of_stock')
  })

  it('returns 400 for invalid quantity', async () => {
    const id = seedInventoryItem()

    const res = await request(app)
      .put(`/api/inventory/${id}/quantity`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ quantity: -1 })
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown item', async () => {
    const res = await request(app)
      .put('/api/inventory/99999/quantity')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ quantity: 5 })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/inventory/bulk', () => {
  it('applies bulk quantity updates', async () => {
    const id1 = seedInventoryItem({ sku: 'B001', quantity: 10 })
    const id2 = seedInventoryItem({ sku: 'B002', quantity: 20 })

    const res = await request(app)
      .post('/api/inventory/bulk')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ items: [{ id: id1, quantity: 2 }, { id: id2, quantity: 0 }] })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(2)
    const r1 = res.body.results.find((r: any) => r.id === id1)
    const r2 = res.body.results.find((r: any) => r.id === id2)
    expect(r1.status).toBe('low_stock')
    expect(r2.status).toBe('out_of_stock')
  })

  it('returns 400 when items array is missing', async () => {
    const res = await request(app)
      .post('/api/inventory/bulk')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/inventory/restock', () => {
  it('adds units to an item', async () => {
    const id = seedInventoryItem({ quantity: 5 })

    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ inventory_id: id, quantity: 10 })
    expect(res.status).toBe(200)
    expect(res.body.new_quantity).toBe(15)
  })

  it('returns 404 for unknown item', async () => {
    const res = await request(app)
      .post('/api/inventory/restock')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ inventory_id: 99999, quantity: 10 })
    expect(res.status).toBe(404)
  })
})
