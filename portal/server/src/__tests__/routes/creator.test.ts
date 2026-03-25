import { describe, it, expect, beforeEach, afterAll, vi, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

// ─── Mock external dependencies ──────────────────────────────────────────────

const mockS3Send = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGenerateContent = vi.hoisted(() => vi.fn())

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeGeminiResponse(base64 = 'aW1hZ2VkYXRh') {
  return {
    candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }],
  }
}

function seedAiImage(userId: number, prompt = 'test prompt') {
  const key = `ai-images/${userId}/${Date.now()}.png`
  const result = db.prepare(
    `INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, 'Test User', prompt, `https://test-bucket.s3.us-east-1.amazonaws.com/${key}`, key)
  return result.lastInsertRowid as number
}

// ─── State ────────────────────────────────────────────────────────────────────

let adminId: number
let tier1Id: number
let tier2Id: number
let tier4Id: number

beforeAll(() => {
  process.env['GEMINI_API_KEY'] = 'test-gemini-key'
  process.env['S3_BUCKET'] = 'test-bucket'
  process.env['AWS_ACCESS_KEY_ID'] = 'test-key-id'
  process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret'
  process.env['AWS_REGION'] = 'us-east-1'
})

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id, tier4Id } = seedTestUsers())
  mockGenerateContent.mockResolvedValue(fakeGeminiResponse())
  mockS3Send.mockResolvedValue({})
})

afterAll(() => db.close())

// ─── POST /api/creator/generate ───────────────────────────────────────────────

describe('POST /api/creator/generate', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/creator/generate').send({ prompt: 'a bottle' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for tier4 (prospect)', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier4Id, 'tier4'))
      .send({ prompt: 'a bottle' })
    expect(res.status).toBe(403)
  })

  it('returns 400 when prompt is missing', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/prompt/i)
  })

  it('returns 400 when prompt is whitespace only', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 503 when GEMINI_API_KEY is missing', async () => {
    const orig = process.env['GEMINI_API_KEY']
    delete process.env['GEMINI_API_KEY']
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    process.env['GEMINI_API_KEY'] = orig
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/GEMINI_API_KEY/i)
  })

  it('returns 503 when S3_BUCKET is missing', async () => {
    const orig = process.env['S3_BUCKET']
    delete process.env['S3_BUCKET']
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    process.env['S3_BUCKET'] = orig
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/S3_BUCKET/i)
  })

  it('returns 503 when AWS_ACCESS_KEY_ID is missing', async () => {
    const orig = process.env['AWS_ACCESS_KEY_ID']
    delete process.env['AWS_ACCESS_KEY_ID']
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    process.env['AWS_ACCESS_KEY_ID'] = orig
    expect(res.status).toBe(503)
  })

  it('returns 500 when AI returns no image data', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [] } }],
    })
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/no image/i)
  })

  it('returns 200 with saved image row', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'A Sliquid H2O bottle on a spa shelf' })
    expect(res.status).toBe(200)
    expect(res.body.id).toBeDefined()
    expect(res.body.prompt).toBe('A Sliquid H2O bottle on a spa shelf')
    expect(res.body.user_id).toBe(tier1Id)
    expect(res.body.s3_url).toContain('test-bucket')
    expect(res.body.s3_key).toContain(`ai-images/${tier1Id}/`)
  })

  it('persists the row in the DB', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'persistence test' })
    const row = db.prepare('SELECT * FROM ai_images WHERE user_id = ?').get(tier1Id) as any
    expect(row).not.toBeNull()
    expect(row.prompt).toBe('persistence test')
  })

  it('allows admin (tier5) to generate', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ prompt: 'admin test' })
    expect(res.status).toBe(200)
  })
})

// ─── GET /api/creator/images ──────────────────────────────────────────────────

describe('GET /api/creator/images', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/creator/images')
    expect(res.status).toBe(401)
  })

  it('returns 403 for tier4', async () => {
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier4Id, 'tier4'))
    expect(res.status).toBe(403)
  })

  it('returns empty array when no images exist', async () => {
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns all images across users', async () => {
    seedAiImage(tier1Id, 'tier1 prompt')
    seedAiImage(adminId, 'admin prompt')
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    const userIds = res.body.map((i: any) => i.user_id)
    expect(userIds).toContain(tier1Id)
    expect(userIds).toContain(adminId)
  })

  it('returns images with correct shape', async () => {
    seedAiImage(tier1Id, 'shape check')
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    const img = res.body[0]
    expect(img).toHaveProperty('id')
    expect(img).toHaveProperty('user_id', tier1Id)
    expect(img).toHaveProperty('created_by')
    expect(img).toHaveProperty('prompt', 'shape check')
    expect(img).toHaveProperty('s3_url')
    expect(img).toHaveProperty('s3_key')
    expect(img).toHaveProperty('created_at')
  })

  it('tier2 user can access images', async () => {
    seedAiImage(tier1Id)
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))
    expect(res.status).toBe(200)
  })
})

// ─── DELETE /api/creator/:id ──────────────────────────────────────────────────

describe('DELETE /api/creator/:id', () => {
  it('returns 401 without auth', async () => {
    const id = seedAiImage(tier1Id)
    const res = await request(app).delete(`/api/creator/${id}`)
    expect(res.status).toBe(401)
  })

  it('returns 404 for non-existent image', async () => {
    const res = await request(app)
      .delete('/api/creator/99999')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when non-owner tries to delete', async () => {
    const id = seedAiImage(tier2Id, 'owned by tier2')
    const res = await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('owner can delete their own image', async () => {
    const id = seedAiImage(tier1Id)
    const res = await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('removes row from DB after delete', async () => {
    const id = seedAiImage(tier1Id)
    await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id)
    expect(row).toBeUndefined()
  })

  it('admin can delete any user\'s image', async () => {
    const id = seedAiImage(tier1Id, 'tier1 image')
    const res = await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id)
    expect(row).toBeUndefined()
  })

  it('succeeds and removes DB row even when S3 delete throws', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 unavailable'))
    const id = seedAiImage(tier1Id)
    const res = await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id)
    expect(row).toBeUndefined()
  })
})
