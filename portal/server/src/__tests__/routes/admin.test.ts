import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedUser } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

afterAll(() => db.close())

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/users')
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns all users for admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('includes status field in each user row', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body[0]).toHaveProperty('status')
  })

  it('filters by ?status=pending', async () => {
    seedUser({ status: 'pending', email: 'p1@test.com' })
    seedUser({ status: 'pending', email: 'p2@test.com' })
    seedUser({ status: 'declined', email: 'd1@test.com' })

    const res = await request(app)
      .get('/api/admin/users?status=pending')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.every((u: any) => u.status === 'pending')).toBe(true)
    expect(res.body.length).toBe(2)
  })

  it('filters by ?status=active', async () => {
    seedUser({ status: 'pending', email: 'pending@test.com' })

    const res = await request(app)
      .get('/api/admin/users?status=active')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.every((u: any) => u.status === 'active')).toBe(true)
  })

  it('filters by ?status=declined', async () => {
    seedUser({ status: 'declined', email: 'dec@test.com' })

    const res = await request(app)
      .get('/api/admin/users?status=declined')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].email).toBe('dec@test.com')
  })

  it('returns all users when no status filter', async () => {
    seedUser({ status: 'pending', email: 'p@test.com' })
    seedUser({ status: 'declined', email: 'd@test.com' })

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    const statuses = res.body.map((u: any) => u.status)
    expect(statuses).toContain('pending')
    expect(statuses).toContain('declined')
    expect(statuses).toContain('active')
  })
})

// ─── POST /api/admin/users/:id/approve ───────────────────────────────────────

describe('POST /api/admin/users/:id/approve', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${tier1Id}/approve`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${tier1Id}/approve`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 404 for unknown user', async () => {
    const res = await request(app)
      .post('/api/admin/users/99999/approve')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })

  it('sets status to active and role to tier1', async () => {
    const { id } = seedUser({ status: 'pending', email: 'pend@test.com' })

    const res = await request(app)
      .post(`/api/admin/users/${id}/approve`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('active')
    expect(res.body.role).toBe('tier1')
  })

  it('approved user can subsequently log in', async () => {
    const { id, email, password } = seedUser({ status: 'pending', email: 'toapprove@test.com' })

    await request(app)
      .post(`/api/admin/users/${id}/approve`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeDefined()
  })

  it('approved user always becomes tier1 regardless of original role', async () => {
    const { id, email, password } = seedUser({ status: 'pending', role: 'tier4', email: 'promoted@test.com' })

    await request(app)
      .post(`/api/admin/users/${id}/approve`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
    expect(login.body.user.role).toBe('tier1')
  })
})

// ─── POST /api/admin/users/:id/decline ───────────────────────────────────────

describe('POST /api/admin/users/:id/decline', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${tier1Id}/decline`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${tier1Id}/decline`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 404 for unknown user', async () => {
    const res = await request(app)
      .post('/api/admin/users/99999/decline')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })

  it('sets status to declined', async () => {
    const { id } = seedUser({ status: 'pending', email: 'todecline@test.com' })

    const res = await request(app)
      .post(`/api/admin/users/${id}/decline`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('declined')

    const row = db.prepare('SELECT status FROM users WHERE id = ?').get(id) as { status: string }
    expect(row.status).toBe('declined')
  })

  it('declined user cannot log in — returns 403', async () => {
    const { id, email, password } = seedUser({ status: 'pending', email: 'willbedeclined@test.com' })

    await request(app)
      .post(`/api/admin/users/${id}/decline`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
    expect(login.status).toBe(403)
    expect(login.body.message).toMatch(/declined/i)
  })

  it('declining an already-active user also sets status to declined', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${tier1Id}/decline`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('declined')
  })

  it('decline does not change the user role', async () => {
    const { id } = seedUser({ status: 'pending', role: 'tier4', email: 'keeprole@test.com' })

    await request(app)
      .post(`/api/admin/users/${id}/decline`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string }
    expect(row.role).toBe('tier4')
  })
})

// ─── Login includes status field ──────────────────────────────────────────────

describe('Login response includes status', () => {
  it('login response includes status field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'Admin1234!' })
    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe('active')
  })

  it('pending user login response has status pending', async () => {
    const { email, password } = seedUser({ status: 'pending', email: 'statuscheck@test.com' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
    expect(res.status).toBe(200)
    expect(res.body.user.status).toBe('pending')
  })
})
