import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedMediaItem } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

// Mock S3 so tests don't hit AWS
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}))

// Provide minimal env vars required by the route
process.env['S3_BUCKET'] = 'test-bucket'
process.env['AWS_ACCESS_KEY_ID'] = 'test-key'
process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret'
process.env['AWS_REGION'] = 'us-east-1'

let adminId: number
let tier1Id: number
let tier2Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id } = seedTestUsers())
})

afterAll(() => db.close())

// ─── GET /api/media ───────────────────────────────────────────────────────────

describe('GET /api/media', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/media')
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin roles', async () => {
    for (const [id, role] of [[tier1Id, 'tier1'], [tier2Id, 'tier2']] as const) {
      const res = await request(app)
        .get('/api/media')
        .set('Authorization', bearerToken(id, role))
      expect(res.status).toBe(403)
    }
  })

  it('returns empty array when no S3 items exist', async () => {
    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBe(0)
  })

  it('returns media items with _source field', async () => {
    seedMediaItem({ label: 'My Logo', brand: 'Sliquid' })

    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    const item = res.body[0]
    expect(item._source).toBe('media')
    expect(item.label).toBe('My Logo')
    expect(item.brand).toBe('Sliquid')
    expect(item.file_url).toBeTruthy()
    expect(item.thumbnail_url).toBeTruthy()
  })

  it('returns multiple items sorted by created_at desc', async () => {
    db.prepare(
      'INSERT INTO media (filename, label, brand, s3_key, file_url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('a.png', 'First', 'Sliquid', 'portal-assets/media/a.png', 'https://bucket/a.png', 'Admin', '2024-01-01 10:00:00')
    db.prepare(
      'INSERT INTO media (filename, label, brand, s3_key, file_url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('b.png', 'Second', 'Sliquid', 'portal-assets/media/b.png', 'https://bucket/b.png', 'Admin', '2024-01-02 10:00:00')

    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    // Most recent first
    expect(res.body[0].label).toBe('Second')
    expect(res.body[1].label).toBe('First')
  })

  it('aggregates ai_images with _source=ai', async () => {
    db.prepare(
      'INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key) VALUES (?, ?, ?, ?, ?)'
    ).run(adminId, 'Test Admin', 'test prompt', 'https://bucket.s3.us-east-1.amazonaws.com/ai-images/test.png', 'ai-images/test.png')

    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    const aiItem = res.body.find((i: any) => i._source === 'ai')
    expect(aiItem).toBeTruthy()
    expect(aiItem.brand).toBe('Creator Creations')
    expect(aiItem.label).toBe('test prompt')
  })

  it('aggregates assets with s3_key', async () => {
    db.prepare(
      'INSERT INTO assets (name, brand, type, file_url, s3_key) VALUES (?, ?, ?, ?, ?)'
    ).run('Test Asset', 'Sliquid', 'Logo', 'https://bucket.s3.us-east-1.amazonaws.com/portal-assets/test.png', 'portal-assets/test.png')

    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    const assetItem = res.body.find((i: any) => i._source === 'asset')
    expect(assetItem).toBeTruthy()
    expect(assetItem.label).toBe('Test Asset')
  })

  it('excludes assets without s3_key', async () => {
    db.prepare(
      'INSERT INTO assets (name, brand, type, file_url) VALUES (?, ?, ?, ?)'
    ).run('No S3', 'Sliquid', 'Logo', 'https://example.com/image.png')

    const res = await request(app)
      .get('/api/media')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    const assetItem = res.body.find((i: any) => i._source === 'asset')
    expect(assetItem).toBeUndefined()
  })
})

// ─── POST /api/media/upload ───────────────────────────────────────────────────

describe('POST /api/media/upload', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .attach('file', Buffer.from('fake image data'), { filename: 'test.png', contentType: 'image/png' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .attach('file', Buffer.from('fake image data'), { filename: 'test.png', contentType: 'image/png' })
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no file/i)
  })

  it('uploads a file and returns the new media item', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .field('label', 'My Upload')
      .field('brand', 'Sliquid')
      .attach('file', Buffer.from('fake png data'), { filename: 'logo.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(res.body._source).toBe('media')
    expect(res.body.label).toBe('My Upload')
    expect(res.body.brand).toBe('Sliquid')
    expect(res.body.file_url).toBeTruthy()
    expect(res.body.thumbnail_url).toBe(res.body.file_url)
    expect(res.body.mime_type).toBe('image/png')
  })

  it('auto-fills label from filename when not provided', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .attach('file', Buffer.from('data'), { filename: 'product-banner.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(res.body.label).toBe('product-banner')
  })

  it('defaults brand to Sliquid when not provided', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .attach('file', Buffer.from('data'), { filename: 'test.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(res.body.brand).toBe('Sliquid')
  })

  it('persists the item to the media table', async () => {
    await request(app)
      .post('/api/media/upload')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .field('label', 'Persisted')
      .attach('file', Buffer.from('data'), { filename: 'test.png', contentType: 'image/png' })

    const row = db.prepare("SELECT * FROM media WHERE label = 'Persisted'").get() as any
    expect(row).toBeTruthy()
    expect(row.uploaded_by).toBe('Test Admin')
    expect(row.s3_key).toMatch(/^portal-assets\/media\//)
  })
})

// ─── PUT /api/media/:id ───────────────────────────────────────────────────────

describe('PUT /api/media/:id', () => {
  it('returns 401 without auth', async () => {
    const id = seedMediaItem()
    const res = await request(app).put(`/api/media/${id}`).send({ label: 'New' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const id = seedMediaItem()
    const res = await request(app)
      .put(`/api/media/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ label: 'New', brand: 'Sliquid' })
    expect(res.status).toBe(403)
  })

  it('updates label and brand', async () => {
    const id = seedMediaItem({ label: 'Old Label', brand: 'Sliquid' })

    const res = await request(app)
      .put(`/api/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'New Label', brand: 'RIDE' })

    expect(res.status).toBe(200)
    expect(res.body.label).toBe('New Label')
    expect(res.body.brand).toBe('RIDE')
    expect(res.body._source).toBe('media')
  })

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .put('/api/media/9999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'Ghost', brand: 'Sliquid' })
    expect(res.status).toBe(404)
  })

  it('persists changes to the database', async () => {
    const id = seedMediaItem({ label: 'Before' })

    await request(app)
      .put(`/api/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'After', brand: 'RIDE' })

    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
    expect(row.label).toBe('After')
    expect(row.brand).toBe('RIDE')
  })
})

// ─── PUT /api/media/item/:source/:id — unified update ────────────────────────

describe('PUT /api/media/item/:source/:id', () => {
  it('returns 401 without auth', async () => {
    const id = seedMediaItem()
    const res = await request(app).put(`/api/media/item/media/${id}`).send({ label: 'New' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const id = seedMediaItem()
    const res = await request(app)
      .put(`/api/media/item/media/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
      .send({ label: 'New', brand: 'Sliquid' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown source', async () => {
    const res = await request(app)
      .put('/api/media/item/unknown/1')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'x' })
    expect(res.status).toBe(400)
  })

  it('updates a media row', async () => {
    const id = seedMediaItem({ label: 'Old', brand: 'Sliquid' })
    const res = await request(app)
      .put(`/api/media/item/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'Updated', brand: 'RIDE' })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('Updated')
    expect(res.body.brand).toBe('RIDE')
    expect(res.body._source).toBe('media')
  })

  it('updates an asset', async () => {
    const assetId = db.prepare(
      "INSERT INTO assets (name, brand, type, file_url, s3_key) VALUES ('Logo', 'Sliquid', 'Logo', 'https://bucket/a.png', 'portal-assets/a.png')"
    ).run().lastInsertRowid

    const res = await request(app)
      .put(`/api/media/item/asset/${assetId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'New Logo', brand: 'RIDE', type: 'Banner', file_url: 'https://bucket/new.png' })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('New Logo')
    expect(res.body._source).toBe('asset')
  })

  it('returns 400 for asset missing required fields', async () => {
    const assetId = db.prepare(
      "INSERT INTO assets (name, brand, type, file_url, s3_key) VALUES ('Logo', 'Sliquid', 'Logo', 'https://bucket/a.png', 'portal-assets/b.png')"
    ).run().lastInsertRowid

    const res = await request(app)
      .put(`/api/media/item/asset/${assetId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'Missing fields' }) // no brand/type/file_url
    expect(res.status).toBe(400)
  })

  it('updates a creative', async () => {
    const creativeId = db.prepare(
      "INSERT INTO creatives (title, brand, type, file_url, s3_key) VALUES ('Banner', 'Sliquid', 'Banner', 'https://bucket/c.png', 'portal-assets/c.png')"
    ).run().lastInsertRowid

    const res = await request(app)
      .put(`/api/media/item/creative/${creativeId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'Updated Banner', brand: 'Sliquid', type: 'Email', file_url: 'https://bucket/c2.png' })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('Updated Banner')
    expect(res.body._source).toBe('creative')
  })

  it('updates a marketing item', async () => {
    const mktId = db.prepare(
      "INSERT INTO marketing_items (name, subtitle, sort_order) VALUES ('Counter Cards', 'Original sub', 0)"
    ).run().lastInsertRowid

    const res = await request(app)
      .put(`/api/media/item/marketing/${mktId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ name: 'Updated Cards', subtitle: 'New sub', description: 'Desc' })
    expect(res.status).toBe(200)
    expect(res.body.label).toBe('Updated Cards')
    expect(res.body._source).toBe('marketing')
  })

  it('can update brand/type on an AI image', async () => {
    const aiId = db.prepare(
      'INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key) VALUES (?, ?, ?, ?, ?)'
    ).run(adminId, 'Admin', 'test', 'https://bucket/ai.png', 'ai-images/ai.png').lastInsertRowid

    const res = await request(app)
      .put(`/api/media/item/ai/${aiId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ brand: 'Ride Lube', type: 'product' })
    expect(res.status).toBe(200)
    expect(res.body._source).toBe('ai')
    expect(res.body.brand).toBe('Ride Lube')
  })

  it('returns 404 for non-existent item', async () => {
    const res = await request(app)
      .put('/api/media/item/media/9999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ label: 'Ghost', brand: 'Sliquid' })
    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/media/item/:source/:id — unified delete ─────────────────────

describe('DELETE /api/media/item/:source/:id', () => {
  it('returns 401 without auth', async () => {
    const id = seedMediaItem()
    const res = await request(app).delete(`/api/media/item/media/${id}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const id = seedMediaItem()
    const res = await request(app)
      .delete(`/api/media/item/media/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for unknown source', async () => {
    const res = await request(app)
      .delete('/api/media/item/unknown/1')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(400)
  })

  it('deletes a media row', async () => {
    const id = seedMediaItem()
    const res = await request(app)
      .delete(`/api/media/item/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(db.prepare('SELECT * FROM media WHERE id = ?').get(id)).toBeUndefined()
  })

  it('deletes an asset', async () => {
    const assetId = db.prepare(
      "INSERT INTO assets (name, brand, type, file_url, s3_key) VALUES ('Logo', 'Sliquid', 'Logo', 'https://bucket/d.png', 'portal-assets/d.png')"
    ).run().lastInsertRowid

    const res = await request(app)
      .delete(`/api/media/item/asset/${assetId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId)).toBeUndefined()
  })

  it('deletes a creative', async () => {
    const creativeId = db.prepare(
      "INSERT INTO creatives (title, brand, type, file_url, s3_key) VALUES ('Ad', 'Sliquid', 'Banner', 'https://bucket/e.png', 'portal-assets/e.png')"
    ).run().lastInsertRowid

    const res = await request(app)
      .delete(`/api/media/item/creative/${creativeId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT * FROM creatives WHERE id = ?').get(creativeId)).toBeUndefined()
  })

  it('deletes a marketing item', async () => {
    const mktId = db.prepare(
      "INSERT INTO marketing_items (name, sort_order) VALUES ('Sign', 0)"
    ).run().lastInsertRowid

    const res = await request(app)
      .delete(`/api/media/item/marketing/${mktId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(mktId)).toBeUndefined()
  })

  it('deletes an AI image', async () => {
    const aiId = db.prepare(
      'INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key) VALUES (?, ?, ?, ?, ?)'
    ).run(adminId, 'Admin', 'test', 'https://bucket/f.png', 'ai-images/f.png').lastInsertRowid

    const res = await request(app)
      .delete(`/api/media/item/ai/${aiId}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT * FROM ai_images WHERE id = ?').get(aiId)).toBeUndefined()
  })

  it('returns 404 for non-existent item', async () => {
    const res = await request(app)
      .delete('/api/media/item/media/9999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/media/:id ────────────────────────────────────────────────────

describe('DELETE /api/media/:id', () => {
  it('returns 401 without auth', async () => {
    const id = seedMediaItem()
    const res = await request(app).delete(`/api/media/${id}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    const id = seedMediaItem()
    const res = await request(app)
      .delete(`/api/media/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('deletes the media item and returns ok', async () => {
    const id = seedMediaItem()

    const res = await request(app)
      .delete(`/api/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('removes the row from the database', async () => {
    const id = seedMediaItem()

    await request(app)
      .delete(`/api/media/${id}`)
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id)
    expect(row).toBeUndefined()
  })

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .delete('/api/media/9999')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(404)
  })
})
