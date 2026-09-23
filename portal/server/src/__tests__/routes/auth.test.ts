import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedUser } from '../helpers/db.js'
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

  it('always registers as tier4 regardless of role param', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Any User', email: 'any@test.com', company: 'Co', password: 'ValidPass1!', role: 'tier1' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('tier4')
  })

  it('ignores tier5 in role param — still registers as tier4', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Hacker', email: 'hacker@test.com', company: 'Evil', password: 'ValidPass1!', role: 'tier5' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('tier4')
  })

  it('new registration has status pending', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Pending', email: 'pending@test.com', company: 'Co', password: 'ValidPass1!' })
    expect(res.status).toBe(201)
    const row = db.prepare('SELECT status FROM users WHERE email = ?').get('pending@test.com') as { status: string }
    expect(row.status).toBe('pending')
  })

  it('pending user can log in and receives a token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Pending', email: 'pending2@test.com', company: 'Co', password: 'ValidPass1!' })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending2@test.com', password: 'ValidPass1!' })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeDefined()
  })

  it('declined user cannot log in — returns 403', async () => {
    const { email, password } = seedUser({ status: 'declined' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/declined/i)
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

// Own rate-limit bucket: earlier tests in this file already exhaust loginLimiter's
// 15-per-window budget for the default supertest IP.
const LANG_TEST_IP = '203.0.113.62'

describe('preferred language', () => {
  it('is null on /me and login until the user picks one', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', bearerToken(adminId, 'tier5'))
    expect(me.body.preferred_language).toBeNull()
    const login = await request(app).post('/api/auth/login').set('X-Forwarded-For', LANG_TEST_IP).send({ email: 'admin@test.com', password: 'Admin1234!' })
    expect(login.body.user.preferred_language).toBeNull()
  })

  it('PUT /me/language saves it, and /me and login return it', async () => {
    const put = await request(app)
      .put('/api/auth/me/language')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ language: 'es' })
    expect(put.status).toBe(200)
    expect(put.body.preferred_language).toBe('es')

    const me = await request(app).get('/api/auth/me').set('Authorization', bearerToken(adminId, 'tier5'))
    expect(me.body.preferred_language).toBe('es')
    const login = await request(app).post('/api/auth/login').set('X-Forwarded-For', LANG_TEST_IP).send({ email: 'admin@test.com', password: 'Admin1234!' })
    expect(login.body.user.preferred_language).toBe('es')
  })

  it('only changes the calling user', async () => {
    const { tier1Id } = db.prepare("SELECT id AS tier1Id FROM users WHERE email = 'tier1@test.com'").get() as { tier1Id: number }
    await request(app)
      .put('/api/auth/me/language')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ language: 'fr' })
    const row = db.prepare('SELECT preferred_language FROM users WHERE id = ?').get(tier1Id) as { preferred_language: string | null }
    expect(row.preferred_language).toBeNull()
  })

  it.each([['de'], [''], [null], [123], ['EN']])('rejects unsupported language %p with 400', async (language) => {
    const res = await request(app)
      .put('/api/auth/me/language')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ language })
    expect(res.status).toBe(400)
  })

  it('requires auth', async () => {
    const res = await request(app).put('/api/auth/me/language').send({ language: 'es' })
    expect(res.status).toBe(401)
  })
})
