import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import {
  db,
  resetDb,
  seedTestUsers,
  seedTraining,
  seedQuizResult,
} from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

afterAll(() => db.close())

// ─── POST /api/quiz/complete ─────────────────────────────────────────────────

describe('POST /api/quiz/complete', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .send({ quizId: 'test', quizTitle: 'Test', score: 80 })
    expect(res.status).toBe(401)
  })

  it('returns 400 when quizId is missing', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizTitle: 'Test', score: 80 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when score is missing', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'test', quizTitle: 'Test' })
    expect(res.status).toBe(400)
  })

  it('saves a passing result (score >= 70)', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'h2o-vs-sassy', quizTitle: 'H2O vs Sassy', score: 85 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.passed).toBe(true)
    expect(res.body.score).toBe(85)
  })

  it('saves a failing result (score < 70)', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'h2o-vs-sassy', quizTitle: 'H2O vs Sassy', score: 50 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.passed).toBe(false)
  })

  it('clamps score to 0–100 range', async () => {
    const res = await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'any-quiz', quizTitle: 'Any', score: 150 })

    expect(res.status).toBe(200)
    expect(res.body.score).toBe(100)
  })
})

// ─── GET /api/quiz/results ───────────────────────────────────────────────────

describe('GET /api/quiz/results', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/quiz/results')
    expect(res.status).toBe(401)
  })

  it('returns empty array when user has no results', async () => {
    const res = await request(app)
      .get('/api/quiz/results')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("returns only the current user's results", async () => {
    // Seed results for tier1 and admin
    seedQuizResult(tier1Id, 'quiz-a', true)
    seedQuizResult(adminId, 'quiz-b', true)

    const res = await request(app)
      .get('/api/quiz/results')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].quiz_id).toBe('quiz-a')
  })
})

// ─── Certificate auto-issuance ───────────────────────────────────────────────

describe('Certificate auto-issuance on quiz completion', () => {
  it('does NOT issue a certificate when there are no trainings', async () => {
    // No trainings seeded → no cert should be created
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'solo-quiz', quizTitle: 'Solo', score: 90 })

    const cert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(tier1Id)
    expect(cert).toBeUndefined()
  })

  it('does NOT issue a certificate when not all trainings are passed', async () => {
    seedTraining('quiz-a')
    seedTraining('quiz-b')

    // Pass only quiz-a
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'quiz-a', quizTitle: 'Quiz A', score: 80 })

    const cert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(tier1Id)
    expect(cert).toBeUndefined()
  })

  it('does NOT issue a certificate when a quiz is failed', async () => {
    seedTraining('quiz-a')
    seedTraining('quiz-b')

    // Fail quiz-a, pass quiz-b
    seedQuizResult(tier1Id, 'quiz-a', false, 40)
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'quiz-b', quizTitle: 'Quiz B', score: 90 })

    const cert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(tier1Id)
    expect(cert).toBeUndefined()
  })

  it('issues a certificate when all trainings are passed', async () => {
    seedTraining('quiz-a')
    seedTraining('quiz-b')

    // Pre-pass quiz-a, then complete quiz-b via API
    seedQuizResult(tier1Id, 'quiz-a', true)

    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'quiz-b', quizTitle: 'Quiz B', score: 90 })

    const cert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(tier1Id) as any
    expect(cert).not.toBeUndefined()
    expect(cert.user_id).toBe(tier1Id)
    expect(cert.is_valid).toBe(1)
    expect(cert.certificate_number).toMatch(/^SLQ-\d{4}-[A-F0-9]{6}$/)
  })

  it('certificate number matches SLQ-YYYY-XXXXXX format', async () => {
    seedTraining('only-quiz')
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'only-quiz', quizTitle: 'Only Quiz', score: 100 })

    const cert = db.prepare('SELECT certificate_number FROM certificates WHERE user_id = ?').get(tier1Id) as any
    expect(cert.certificate_number).toMatch(/^SLQ-\d{4}-[A-F0-9]{6}$/)
  })

  it('does NOT issue a duplicate certificate if one already exists', async () => {
    seedTraining('quiz-a')

    // Complete the single training twice
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'quiz-a', quizTitle: 'Quiz A', score: 90 })

    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'quiz-a', quizTitle: 'Quiz A', score: 95 })

    const certs = db.prepare('SELECT * FROM certificates WHERE user_id = ?').all(tier1Id)
    expect(certs).toHaveLength(1)
  })

  it('issues certificates independently per user', async () => {
    seedTraining('shared-quiz')
    seedQuizResult(adminId, 'shared-quiz', true) // admin already passed

    // tier1 passes
    await request(app)
      .post('/api/quiz/complete')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ quizId: 'shared-quiz', quizTitle: 'Shared Quiz', score: 80 })

    const tier1Cert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(tier1Id)
    const adminCert = db.prepare('SELECT * FROM certificates WHERE user_id = ?').get(adminId)

    expect(tier1Cert).not.toBeUndefined()
    expect(adminCert).toBeUndefined() // admin passed via seed, not via API — no cert issued
  })
})

// ─── Admin users list includes certificate_number ────────────────────────────

describe('GET /api/admin/users — certificate_number field', () => {
  it('includes certificate_number: null for users without a cert', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    const tier1Row = res.body.find((u: any) => u.id === tier1Id)
    expect(tier1Row).toBeDefined()
    expect(tier1Row.certificate_number).toBeNull()
  })

  it('includes certificate_number for certified users', async () => {
    db.prepare(
      'INSERT INTO certificates (certificate_number, user_id, issued_to) VALUES (?, ?, ?)'
    ).run('SLQ-2025-TESTXX', tier1Id, 'Tier1 User')

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const tier1Row = res.body.find((u: any) => u.id === tier1Id)
    expect(tier1Row.certificate_number).toBe('SLQ-2025-TESTXX')
  })
})
