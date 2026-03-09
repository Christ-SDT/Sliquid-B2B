import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number

beforeEach(() => {
  resetDb()
  ;({ adminId } = seedTestUsers())
})

afterAll(() => db.close())

describe('POST /api/auth/login', () => {
  it('returns 200 with token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('admin@test.com')
  })

  it('does not return password_hash in response', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' })
    expect(res.body.user.password_hash).toBeUndefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' })
    expect(res.status).toBe(401)
  })

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'Admin1234!' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/register', () => {
  it('creates a user with valid data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Valid User', email: 'valid@test.com', company: 'Test Co', password: 'ValidPass1!' })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
  })

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'new@test.com', company: 'Test Co', password: 'short' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'ValidPass1!' })
    expect(res.status).toBe(400)
  })

  it('returns 409 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'admin@test.com', company: 'Test', password: 'ValidPass1!' })
    expect(res.status).toBe(409)
  })

  it('blocks self-registration as tier5 — downgrades to tier1', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Hacker', email: 'hacker@test.com', company: 'Evil', password: 'ValidPass1!', role: 'tier5' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('tier1')
  })

  it('allows registering as tier4 (Prospect)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Prospect', email: 'p2@test.com', company: 'Co', password: 'ValidPass1!', role: 'tier4' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('tier4')
  })
})

describe('GET /api/auth/me', () => {
  it('returns the current user when authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('admin@test.com')
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
