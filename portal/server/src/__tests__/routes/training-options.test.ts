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

const optPayload = {
  label: 'Virtual Training',
  subtitle: 'Live video session',
  description: 'A Sliquid rep joins your team over video call.',
  specs: ['Flexible scheduling', 'Product walkthroughs'],
  icon_name: 'Monitor',
  sort_order: 0,
}

describe('GET /api/training-options', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/training-options')
    expect(res.status).toBe(401)
  })

  it('returns a list when authenticated', async () => {
    const res = await request(app)
      .get('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns specs as an array', async () => {
    await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)

    const res = await request(app)
      .get('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body[0].specs)).toBe(true)
  })
})

describe('POST /api/training-options', () => {
  it('creates an option as admin', async () => {
    const res = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    expect(res.status).toBe(201)
    expect(res.body.label).toBe('Virtual Training')
    expect(Array.isArray(res.body.specs)).toBe(true)
    expect(res.body.specs).toHaveLength(2)
  })

  it('returns 400 when label is missing', async () => {
    const res = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ subtitle: 'No label' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(optPayload)
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/training-options').send(optPayload)
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/training-options/:id', () => {
  it('updates an option as admin', async () => {
    const createRes = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/training-options/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...optPayload, label: 'In-Person Training', specs: ['Hands-on demos'] })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('In-Person Training')
    expect(res.body.specs).toEqual(['Hands-on demos'])
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .put('/api/training-options/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    expect(res.status).toBe(404)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/training-options/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ ...optPayload, label: 'Hacked' })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/training-options/:id', () => {
  it('deletes an option as admin', async () => {
    const createRes = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/training-options/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .delete('/api/training-options/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/training-options')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(optPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/training-options/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/training-options/1')
    expect(res.status).toBe(401)
  })
})
