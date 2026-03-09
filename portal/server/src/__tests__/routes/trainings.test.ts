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

const trainingPayload = {
  quiz_id: 'test-quiz',
  title: 'Test Training',
  description: 'A test training module',
  video_path: 'https://youtu.be/test',
  passing_score: 70,
  estimated_minutes: 15,
  sort_order: 0,
}

describe('GET /api/trainings', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/trainings')
    expect(res.status).toBe(401)
  })

  it('returns sorted list when authenticated', async () => {
    const res = await request(app)
      .get('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/trainings', () => {
  it('creates a training as admin', async () => {
    const res = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(trainingPayload)
    expect(res.status).toBe(201)
    expect(res.body.quiz_id).toBe('test-quiz')
    expect(res.body.title).toBe('Test Training')
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ title: 'No quiz_id' })
    expect(res.status).toBe(400)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send(trainingPayload)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/trainings/:id', () => {
  it('updates a training as admin', async () => {
    const createRes = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(trainingPayload)
    const id = createRes.body.id

    const res = await request(app)
      .put(`/api/trainings/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ ...trainingPayload, title: 'Updated Training' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Updated Training')
  })

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .put('/api/trainings/99999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(trainingPayload)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/trainings/:id', () => {
  it('deletes a training as admin', async () => {
    const createRes = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(trainingPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/trainings/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 403 for non-admin', async () => {
    const createRes = await request(app)
      .post('/api/trainings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send(trainingPayload)
    const id = createRes.body.id

    const res = await request(app)
      .delete(`/api/trainings/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })
})
