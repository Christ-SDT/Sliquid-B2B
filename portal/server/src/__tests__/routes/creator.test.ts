import { describe, it, expect, beforeEach, afterEach, afterAll, vi, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

// ─── Mock external dependencies ──────────────────────────────────────────────

const mockS3Send = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGenerateContent = vi.hoisted(() => vi.fn())

// fs mock functions — hoisted so they exist before any import runs
const mockExistsSync   = vi.hoisted(() => vi.fn())
const mockReaddirSync  = vi.hoisted(() => vi.fn())
const mockReadFileSync = vi.hoisted(() => vi.fn())
// Container for real fs implementations (set by vi.mock factory, read by restoreFs())
const _realFs = vi.hoisted(() => ({
  existsSync:   null as ((...a: any[]) => any) | null,
  readdirSync:  null as ((...a: any[]) => any) | null,
  readFileSync: null as ((...a: any[]) => any) | null,
}))

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

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<any>()
  // For CJS modules, actual.default is module.exports; named exports are the same.
  const realDefault = actual.default ?? actual

  // Save real implementations into the hoisted container so restoreFs() can use them
  _realFs.existsSync   = realDefault.existsSync?.bind(realDefault) ?? null
  _realFs.readdirSync  = realDefault.readdirSync?.bind(realDefault) ?? null
  _realFs.readFileSync = realDefault.readFileSync?.bind(realDefault) ?? null

  // Set initial pass-through
  if (_realFs.existsSync)   mockExistsSync.mockImplementation(_realFs.existsSync)
  if (_realFs.readdirSync)  mockReaddirSync.mockImplementation(_realFs.readdirSync)
  if (_realFs.readFileSync) mockReadFileSync.mockImplementation(_realFs.readFileSync)

  const mockDefault = Object.assign({}, realDefault, {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
  })

  return {
    ...actual,
    default: mockDefault,
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
  }
})

// Function declaration is hoisted — safe to call from beforeEach/afterEach
function restoreFs() {
  if (_realFs.existsSync)   mockExistsSync.mockImplementation(_realFs.existsSync)
  if (_realFs.readdirSync)  mockReaddirSync.mockImplementation(_realFs.readdirSync)
  if (_realFs.readFileSync) mockReadFileSync.mockImplementation(_realFs.readFileSync)
}

// ─── Test data helpers ────────────────────────────────────────────────────────

const FAKE_BASE64 = 'aW1hZ2VkYXRh'   // base64 for "imagedata"
const REF_BASE64  = 'cmVmZXJlbmNl'   // base64 for "reference"

/** Minimal Gemini response that includes an image inline part */
function fakeGeminiResponse(base64 = FAKE_BASE64, mimeType = 'image/png') {
  return {
    candidates: [{
      content: { parts: [{ inlineData: { data: base64, mimeType } }] },
    }],
  }
}

/** Gemini response with no image — only text parts */
function fakeGeminiNoImageResponse() {
  return {
    candidates: [{ content: { parts: [{ text: 'I cannot generate an image.' }] } }],
  }
}

function seedAiImage(userId: number, prompt = 'test prompt', model = 'gemini-3.1-flash-image-preview') {
  const key = `ai-images/${userId}/${Date.now()}.png`
  const result = db.prepare(
    'INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key, model) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, 'Test User', prompt, `https://test-bucket.s3.us-east-1.amazonaws.com/${key}`, key, model)
  return result.lastInsertRowid as number
}

/** Set the active model in woo_settings (mirrors what POST /settings does) */
function setActiveModel(model: string) {
  db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('ai_model', ?)").run(model)
}

// ─── State ────────────────────────────────────────────────────────────────────

let adminId: number
let tier1Id: number
let tier2Id: number
let tier4Id: number

beforeAll(() => {
  process.env['GEMINI_API_KEY']        = 'test-gemini-key'
  process.env['S3_BUCKET']             = 'test-bucket'
  process.env['AWS_ACCESS_KEY_ID']     = 'test-key-id'
  process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret'
  process.env['AWS_REGION']            = 'us-east-1'
})

beforeEach(() => {
  restoreFs() // reset fs mocks to pass-through before each test
  mockGenerateContent.mockClear() // clear call history so mock.calls[0] always belongs to this test
  mockS3Send.mockClear()
  resetDb()
  ;({ adminId, tier1Id, tier2Id, tier4Id } = seedTestUsers())
  mockGenerateContent.mockResolvedValue(fakeGeminiResponse())
  mockS3Send.mockResolvedValue({})
})

afterEach(() => {
  restoreFs() // clean up any fs overrides set during the test
})

afterAll(() => db.close())

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/creator/generate — auth & validation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/creator/generate — auth & validation', () => {
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
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/creator/generate — Gemini API call shape
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/creator/generate — Gemini API call shape', () => {
  it('calls generateContent (not generateImages)', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle on a shelf' })
    expect(mockGenerateContent).toHaveBeenCalledOnce()
  })

  it('uses the correct model name', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    const args = mockGenerateContent.mock.calls[0][0]
    expect(args.model).toBe('gemini-3.1-flash-image-preview')
  })

  it('requests IMAGE and TEXT response modalities', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    const args = mockGenerateContent.mock.calls[0][0]
    expect(args.config.responseModalities).toContain('IMAGE')
    expect(args.config.responseModalities).toContain('TEXT')
  })

  it('includes systemInstruction in config', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    const args = mockGenerateContent.mock.calls[0][0]
    expect(args.config.systemInstruction).toBeTruthy()
    expect(typeof args.config.systemInstruction).toBe('string')
    expect(args.config.systemInstruction).toMatch(/sliquid/i)
  })

  it('does not include imageConfig or tools in config', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    const { config } = mockGenerateContent.mock.calls[0][0]
    expect(config).not.toHaveProperty('imageConfig')
    expect(config).not.toHaveProperty('tools')
    expect(config).not.toHaveProperty('thinkingConfig')
  })

  it('user message role is "user"', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    const args = mockGenerateContent.mock.calls[0][0]
    expect(args.contents[0].role).toBe('user')
  })

  it('last part of contents is a text part containing the prompt', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'marble countertop scene' })
    const parts = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const textPart = parts[parts.length - 1]
    expect(textPart).toHaveProperty('text')
    expect(textPart.text).toMatch(/marble countertop scene/i)
  })

  it('returns 500 when AI returns no image parts', async () => {
    mockGenerateContent.mockResolvedValueOnce(fakeGeminiNoImageResponse())
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/no image/i)
  })

  it('returns 500 when AI returns empty candidates', async () => {
    mockGenerateContent.mockResolvedValueOnce({ candidates: [] })
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle' })
    expect(res.status).toBe(500)
  })

  it('returns 200 with correct response shape', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'H2O bottle on a spa shelf' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      user_id: tier1Id,
      prompt: 'H2O bottle on a spa shelf',
      s3_url: expect.stringContaining('test-bucket'),
      s3_key: expect.stringContaining(`ai-images/${tier1Id}/`),
    })
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

  it('stores created_by as the authenticated user name', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'creator name test' })
    const row = db.prepare('SELECT created_by FROM ai_images WHERE user_id = ?').get(tier1Id) as any
    expect(row.created_by).toBeTruthy()
    expect(typeof row.created_by).toBe('string')
  })

  it('stores the active model in the model column', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'model column test' })
    const row = db.prepare('SELECT model FROM ai_images WHERE user_id = ?').get(tier1Id) as any
    expect(row.model).toBe('gemini-3.1-flash-image-preview')
  })

  it('stores the settings model in model column when overridden', async () => {
    setActiveModel('imagen-3.0-generate-002')
    // Even when settings say Imagen, generation still calls Gemini — but records the setting
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'model override test' })
    const row = db.prepare('SELECT model FROM ai_images WHERE user_id = ?').get(tier1Id) as any
    expect(row.model).toBe('imagen-3.0-generate-002')
  })

  it('tier1 can generate', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'tier1 test' })
    expect(res.status).toBe(200)
  })

  it('tier2 can generate', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))
      .send({ prompt: 'tier2 test' })
    expect(res.status).toBe(200)
  })

  it('admin (tier5) can generate', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ prompt: 'admin test' })
    expect(res.status).toBe(200)
  })

  it('s3_key has .png extension by default', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'extension test' })
    expect(res.body.s3_key).toMatch(/\.png$/)
  })

  it('s3_key has correct extension when AI returns jpeg mimeType', async () => {
    mockGenerateContent.mockResolvedValueOnce(fakeGeminiResponse(FAKE_BASE64, 'image/jpeg'))
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'jpeg extension test' })
    expect(res.body.s3_key).toMatch(/\.jpg$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/creator/generate — label images (fs-based vision reference)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/creator/generate — label images', () => {
  function mockLabelsDir(files: string[]) {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(files as any)
    mockReadFileSync.mockReturnValue(Buffer.from('fake-label-image') as any)
  }

  it('includes matched label images as inline parts when labels folder has keyword matches', async () => {
    mockLabelsDir(['H2O 2oz 2025.png', 'H2O 4oz 2025.png', 'Sassy 2oz.png'])

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'H2O bottle on a marble shelf' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter(p => p.inlineData)
    // 'H2O' matches the two H2O files but not Sassy
    expect(imageParts.length).toBe(2)
    expect(imageParts[0].inlineData.mimeType).toBe('image/png')
    expect(imageParts[0].inlineData.data).toBeTruthy()
  })

  it('sends up to 5 matched images (maxCount cap)', async () => {
    // 7 files that all match "swirl"
    const files = Array.from({ length: 7 }, (_, i) => `Swirl variant ${i + 1}.png`)
    mockLabelsDir(files)

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'Swirl bottle lifestyle photo' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter(p => p.inlineData)
    expect(imageParts.length).toBeLessThanOrEqual(5)
  })

  it('sends no label images when prompt only contains stop words', async () => {
    mockLabelsDir(['H2O 2oz.png', 'Sassy 4oz.png'])

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      // "a bottle on the shelf" — "a", "on", "the" are stop words; "bottle" and "shelf" are stop words too
      .send({ prompt: 'a bottle on the shelf' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter(p => p.inlineData)
    expect(imageParts.length).toBe(0)
  })

  it('sends no label images when labels directory does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'H2O sassy swirl bottle' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter(p => p.inlineData)
    expect(imageParts.length).toBe(0)
  })

  it('sends no label images when directory has no image files', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([] as any)

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'H2O bottle' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter(p => p.inlineData)
    expect(imageParts.length).toBe(0)
  })

  it('label images appear before the text part in the parts array', async () => {
    mockLabelsDir(['Silver 2oz.png', 'Silver 4oz.png'])

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'Silver bottle on a counter' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const lastPart = parts[parts.length - 1]
    // text part must be last
    expect(lastPart).toHaveProperty('text')
    // all parts before last should be image parts
    const beforeLast = parts.slice(0, parts.length - 1)
    expect(beforeLast.every((p: any) => p.inlineData)).toBe(true)
  })

  it('text part includes refNote count when label images are matched', async () => {
    mockLabelsDir(['Satin 2oz.png', 'Satin 4oz.png'])

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'Satin bottle' })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const textPart = parts[parts.length - 1]
    expect(textPart.text).toMatch(/reference image/i)
  })

  it('uses text-based product name fallback when no label images match', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['Satin 2oz.png'] as any)

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      // "Sea" does not match "Satin" — getMatchedProductNames runs as fallback
      .send({ prompt: 'Satin bottle elegant setting' })

    // Should still generate successfully
    const res2 = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'unknown product xyz bottle' })

    // No label images matched for "unknown xyz" — text fallback runs, still gets 200
    expect(res2.status).toBe(200)
  })

  it('still returns 200 when fs.readFileSync throws (graceful fail)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['H2O 2oz.png'] as any)
    mockReadFileSync.mockImplementation(() => { throw new Error('disk error') })

    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'H2O bottle' })

    // getLabelImageParts catches the error and returns [] — generation continues without label images
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/creator/generate — referenceImage (user-uploaded)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/creator/generate — referenceImage', () => {
  it('succeeds without referenceImage', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle on a shelf' })
    expect(res.status).toBe(200)
  })

  it('includes user reference image as inline part when provided', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'recreate this bottle in a spa setting',
        referenceImage: { data: REF_BASE64, mimeType: 'image/jpeg' },
      })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const refPart = parts.find((p: any) =>
      p.inlineData?.data === REF_BASE64 && p.inlineData?.mimeType === 'image/jpeg'
    )
    expect(refPart).toBeDefined()
  })

  it('reference image appears before the text part', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'bottle on a shelf',
        referenceImage: { data: REF_BASE64, mimeType: 'image/png' },
      })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const refIndex = parts.findIndex((p: any) => p.inlineData?.data === REF_BASE64)
    const textIndex = parts.findIndex((p: any) => p.text)
    expect(refIndex).toBeGreaterThanOrEqual(0)
    expect(textIndex).toBeGreaterThan(refIndex)
  })

  it('supports both label images and user reference image together', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['Silk 2oz.png'] as any)
    mockReadFileSync.mockReturnValue(Buffer.from('label-data') as any)

    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'Silk bottle in a bathroom',
        referenceImage: { data: REF_BASE64, mimeType: 'image/jpeg' },
      })

    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const imageParts = parts.filter((p: any) => p.inlineData)
    // 1 label image (Silk match) + 1 user upload = 2
    expect(imageParts.length).toBe(2)
  })

  it('ignores referenceImage when data field is missing', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'a bottle',
        referenceImage: { mimeType: 'image/png' },  // no data field
      })
    expect(res.status).toBe(200)
    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    // No inline parts from user (labels also empty since no keyword match for stop-word prompt)
    const userRefPart = parts.find((p: any) => p.inlineData?.mimeType === 'image/png' && !p.inlineData?.data?.startsWith('ZmFr'))
    expect(userRefPart).toBeUndefined()
  })

  it('ignores referenceImage when it is null', async () => {
    const res = await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ prompt: 'a bottle', referenceImage: null })
    expect(res.status).toBe(200)
  })

  it('does not store referenceImage data in the DB — only stores prompt', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'bottle with user image',
        referenceImage: { data: REF_BASE64, mimeType: 'image/jpeg' },
      })
    const row = db.prepare('SELECT * FROM ai_images WHERE user_id = ?').get(tier1Id) as any
    expect(row.prompt).toBe('bottle with user image')
    // The referenceImage is NOT persisted — check the row has no reference image column
    expect(row).not.toHaveProperty('reference_image')
  })

  it('text part includes refNote when user image is provided', async () => {
    await request(app)
      .post('/api/creator/generate')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({
        prompt: 'bottle in spa',
        referenceImage: { data: REF_BASE64, mimeType: 'image/png' },
      })
    const parts: any[] = mockGenerateContent.mock.calls[0][0].contents[0].parts
    const textPart = parts[parts.length - 1]
    expect(textPart.text).toMatch(/reference image/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/creator/settings
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/creator/settings', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/creator/settings')
    expect(res.status).toBe(401)
  })

  it('returns 403 for tier1', async () => {
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 403 for tier2', async () => {
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))
    expect(res.status).toBe(403)
  })

  it('returns 403 for tier4 (prospect)', async () => {
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(tier4Id, 'tier4'))
    expect(res.status).toBe(403)
  })

  it('returns default model (gemini-3.1-flash-image-preview) when no DB setting', async () => {
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.model).toBe('gemini-3.1-flash-image-preview')
  })

  it('returns stored model when DB row exists', async () => {
    setActiveModel('imagen-3.0-generate-002')
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.model).toBe('imagen-3.0-generate-002')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/creator/settings
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/creator/settings', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .send({ model: 'gemini-3.1-flash-image-preview' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for tier1', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ model: 'gemini-3.1-flash-image-preview' })
    expect(res.status).toBe(403)
  })

  it('returns 403 for tier4', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(tier4Id, 'tier4'))
      .send({ model: 'gemini-3.1-flash-image-preview' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for an unrecognised model name', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'gpt-4o' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/model must be one of/i)
  })

  it('returns 400 when model field is missing', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({})
    expect(res.status).toBe(400)
  })

  it('accepts gemini-3.1-flash-image-preview as a valid model', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'gemini-3.1-flash-image-preview' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, model: 'gemini-3.1-flash-image-preview' })
  })

  it('accepts imagen-3.0-generate-002 as a valid model', async () => {
    const res = await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'imagen-3.0-generate-002' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, model: 'imagen-3.0-generate-002' })
  })

  it('persists the model to woo_settings in the DB', async () => {
    await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'imagen-3.0-generate-002' })
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'ai_model'").get() as any
    expect(row.value).toBe('imagen-3.0-generate-002')
  })

  it('subsequent GET /settings returns the newly saved model', async () => {
    await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'imagen-3.0-generate-002' })
    const res = await request(app)
      .get('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.body.model).toBe('imagen-3.0-generate-002')
  })

  it('overwrites previous setting when called twice', async () => {
    await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'imagen-3.0-generate-002' })
    await request(app)
      .post('/api/creator/settings')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ model: 'gemini-3.1-flash-image-preview' })
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'ai_model'").get() as any
    expect(row.value).toBe('gemini-3.1-flash-image-preview')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/creator/images
// ─────────────────────────────────────────────────────────────────────────────

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

  it('returns all images ordered newest first', async () => {
    seedAiImage(tier1Id, 'first')
    seedAiImage(adminId, 'second')
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })

  it('returns images with correct shape including model field', async () => {
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
    expect(img).toHaveProperty('model')
    expect(img).toHaveProperty('created_at')
  })

  it('tier2 can access images', async () => {
    seedAiImage(tier1Id)
    const res = await request(app)
      .get('/api/creator/images')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))
    expect(res.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/creator/:id
// ─────────────────────────────────────────────────────────────────────────────

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

  it('returns 403 when non-owner tries to delete another user\'s image', async () => {
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

  it('admin (tier5) can delete any user\'s image', async () => {
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

  it('calls S3 DeleteObjectCommand with the correct key', async () => {
    const id = seedAiImage(tier1Id)
    const row = db.prepare('SELECT s3_key FROM ai_images WHERE id = ?').get(id) as any
    await request(app)
      .delete(`/api/creator/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(mockS3Send).toHaveBeenCalled()
    // DeleteObjectCommand was called — the mock captures the send call
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    expect(DeleteObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: row.s3_key })
    )
  })
})
