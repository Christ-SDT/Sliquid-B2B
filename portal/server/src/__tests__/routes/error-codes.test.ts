import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedUser } from '../helpers/db.js'

// Every user-visible error carries a stable `code` the clients translate, while
// the English `message` stays byte-identical for anything still reading it.
// Each test uses its own X-Forwarded-For so the login/reset rate limiters
// (keyed by IP, shared across this file) never trip unintentionally.
let ipSeq = 1
const ip = () => `198.51.100.${ipSeq++}`

beforeEach(() => {
  resetDb()
  seedTestUsers()
})
afterAll(() => db.close())

describe('auth error codes', () => {
  it('invalid credentials (unknown email and wrong password alike)', async () => {
    for (const body of [{ email: 'nobody@test.com', password: 'x' }, { email: 'admin@test.com', password: 'wrong-pass' }]) {
      const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip()).send(body)
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ message: 'Invalid email or password', code: 'auth.invalidCredentials' })
    }
  })

  it('credentials required', async () => {
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip()).send({ email: 'a@b.com' })
    expect(res.body).toEqual({ message: 'Email and password required', code: 'auth.credentialsRequired' })
  })

  it('declined account', async () => {
    seedUser({ email: 'declined@test.com', password: 'Declined123!', status: 'declined' })
    const res = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip())
      .send({ email: 'declined@test.com', password: 'Declined123!' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({
      message: 'Your registration request was declined. Please contact support@sliquid.com.',
      code: 'auth.accountDeclined',
    })
  })

  it('login rate limit', async () => {
    const addr = ip()
    let res
    for (let i = 0; i < 16; i++) {
      res = await request(app).post('/api/auth/login').set('X-Forwarded-For', addr).send({ email: 'x@y.com', password: 'z' })
    }
    expect(res!.status).toBe(429)
    expect(res!.body).toEqual({ message: 'Too many login attempts. Please try again in 15 minutes.', code: 'auth.loginRateLimited' })
  })

  it('register: all fields, short password, email in use', async () => {
    const base = { name: 'N', email: 'new@test.com', company: 'C', password: 'LongEnough1' }
    let res = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip()).send({ ...base, company: '' })
    expect(res.body).toEqual({ message: 'All fields are required', code: 'auth.allFieldsRequired' })
    res = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip()).send({ ...base, password: 'short' })
    expect(res.body).toEqual({ message: 'Password must be at least 8 characters', code: 'auth.passwordTooShort' })
    res = await request(app).post('/api/auth/register').set('X-Forwarded-For', ip()).send({ ...base, email: 'admin@test.com' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Email already in use', code: 'auth.emailInUse' })
  })

  it('forgot password: email required and rate limit', async () => {
    const addr = ip()
    let res = await request(app).post('/api/auth/forgot-password').set('X-Forwarded-For', addr).send({})
    expect(res.body).toEqual({ message: 'Email is required', code: 'auth.emailRequired' })
    for (let i = 0; i < 5; i++) {
      res = await request(app).post('/api/auth/forgot-password').set('X-Forwarded-For', addr).send({ email: 'nobody@test.com' })
    }
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ message: 'Too many password reset requests. Please try again in 15 minutes.', code: 'auth.resetRateLimited' })
  })

  it('reset password: required fields, short password, invalid and expired links', async () => {
    let res = await request(app).post('/api/auth/reset-password').send({ token: 'abc' })
    expect(res.body).toEqual({ message: 'Token and password are required', code: 'auth.resetFieldsRequired' })
    res = await request(app).post('/api/auth/reset-password').send({ token: 'abc', password: 'short' })
    expect(res.body.code).toBe('auth.passwordTooShort')
    res = await request(app).post('/api/auth/reset-password').send({ token: 'no-such-token', password: 'LongEnough1' })
    expect(res.body).toEqual({ message: 'Invalid or expired reset link', code: 'auth.resetLinkInvalid' })

    db.prepare("UPDATE users SET reset_token = 'old-token', reset_token_expires = ? WHERE email = 'admin@test.com'")
      .run(new Date(Date.now() - 60_000).toISOString())
    res = await request(app).post('/api/auth/reset-password').send({ token: 'old-token', password: 'LongEnough1' })
    expect(res.body).toEqual({ message: 'Reset link has expired. Please request a new one.', code: 'auth.resetLinkExpired' })
  })
})

describe('GDPR request error codes', () => {
  it('name required and invalid email', async () => {
    let res = await request(app).post('/api/gdpr/request').send({ type: 'access', name: ' ', email: 'a@b.com' })
    expect(res.body).toEqual({ message: 'name is required.', code: 'forms.nameRequired' })
    res = await request(app).post('/api/gdpr/request').send({ type: 'access', name: 'Jane', email: 'nope' })
    expect(res.body).toEqual({ message: 'A valid email address is required.', code: 'forms.invalidEmail' })
  })
})
