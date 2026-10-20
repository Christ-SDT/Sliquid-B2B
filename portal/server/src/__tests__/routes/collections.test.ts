import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import sharp from 'sharp'

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

const s3Send = vi.hoisted(() => vi.fn(async (_cmd: unknown) => ({})))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3Send } }),
  PutObjectCommand: vi.fn(function (this: any, input: unknown) { this.kind = 'put'; this.input = input }),
  DeleteObjectCommand: vi.fn(function (this: any, input: unknown) { this.kind = 'delete'; this.input = input }),
  GetObjectCommand: vi.fn(function (this: any, input: unknown) { this.kind = 'get'; this.input = input }),
}))

// EmailJS at the SDK boundary, so nothing can ever leave the machine…
const emailjsSend = vi.hoisted(() => vi.fn(async () => ({ status: 200, text: 'OK' })))
vi.mock('@emailjs/nodejs', () => ({ default: { send: emailjsSend } }))
// …and the broadcast itself, so "exactly one broadcast per release" is countable.
const broadcast = vi.hoisted(() => vi.fn(async (_opts: { assetName: string; brand: string }) => {}))
vi.mock('../../email.js', async (orig) => ({ ...(await orig<typeof import('../../email.js')>()), sendBroadcastEmail: broadcast }))

process.env['S3_BUCKET'] = 'test-bucket'
process.env['AWS_ACCESS_KEY_ID'] = 'test-key'
process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret'
process.env['AWS_REGION'] = 'us-west-2'

const request = (await import('supertest')).default
const { app } = await import('../../app.js')
const { db, resetDb, seedTestUsers, seedLegalUser, seedPendingUser } = await import('../helpers/db.js')
const { bearerToken } = await import('../helpers/auth.js')
const { sweepScheduledCollections } = await import('../../collections.js')

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let adminId: number, tier1Id: number, tier2Id: number, tier4Id: number, legalId: number
let admin: string, tier1: string, legal: string

let JPEG: Buffer
let PNG: Buffer
beforeEach(async () => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id, tier4Id } = seedTestUsers())
  legalId = seedLegalUser()
  admin = bearerToken(adminId, 'tier5')
  tier1 = bearerToken(tier1Id, 'tier1')
  legal = bearerToken(legalId, 'tier8')
  s3Send.mockClear()
  broadcast.mockClear()
  emailjsSend.mockClear()
  JPEG ??= await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#3366cc' } }).jpeg().toBuffer()
  PNG ??= await sharp({ create: { width: 300, height: 200, channels: 4, background: '#ffffff00' } }).png().toBuffer()
})
afterEach(() => { vi.unstubAllGlobals() })
afterAll(() => db.close())

async function createCollection(body: Record<string, unknown> = { name: 'Fall Launch', brand: 'Sliquid' }) {
  const res = await request(app).post('/api/collections').set('Authorization', admin).send(body)
  expect(res.status).toBe(201)
  return res.body as { id: number; name: string; brand: string; status: string }
}

async function uploadPhotos(id: number, files: { buf: Buffer; name: string; type?: string }[]) {
  let req = request(app).post(`/api/collections/${id}/photos`).set('Authorization', admin)
  for (const f of files) req = req.attach('files', f.buf, { filename: f.name, contentType: f.type ?? 'image/jpeg' })
  return req
}

/** A collection with `n` photos, in the given status. */
async function seedCollectionWithPhotos(n = 2) {
  const c = await createCollection()
  const res = await uploadPhotos(c.id, Array.from({ length: n }, (_, i) => ({ buf: JPEG, name: `shot_${i + 1}.jpg` })))
  expect(res.status).toBe(201)
  return { id: c.id, photos: res.body.photos as { id: number; thumbnail_url: string; file_url: string }[] }
}

const putKeys = () => s3Send.mock.calls.map(c => c[0] as any).filter(c => c.kind === 'put').map(c => c.input.Key as string)
const deleteKeys = () => s3Send.mock.calls.map(c => c[0] as any).filter(c => c.kind === 'delete').map(c => c.input.Key as string)
const notifCount = (userId: number, type = 'new_asset') =>
  (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = ?').get(userId, type) as { n: number }).n

// ─── Leak guard ───────────────────────────────────────────────────────────────

describe('leak guard — collection photos never appear in /api/assets', () => {
  it('a draft collection photo is absent from GET /api/assets and 404s on GET /api/assets/:id, for admins too', async () => {
    db.prepare("INSERT INTO assets (name, brand, type, file_url) VALUES ('Plain logo', 'Sliquid', 'Logo', 'https://x/logo.png')").run()
    const { photos } = await seedCollectionWithPhotos(2)

    for (const auth of [tier1, admin]) {
      const list = await request(app).get('/api/assets').set('Authorization', auth)
      expect(list.status).toBe(200)
      expect(list.body.map((a: { name: string }) => a.name)).toEqual(['Plain logo'])
      const one = await request(app).get(`/api/assets/${photos[0].id}`).set('Authorization', auth)
      expect(one.status).toBe(404)
    }
  })

  it('stays excluded after release (released photos are served via /api/collections only)', async () => {
    const { id, photos } = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const list = await request(app).get('/api/assets').set('Authorization', tier1)
    expect(list.body).toHaveLength(0)
    const one = await request(app).get(`/api/assets/${photos[0].id}`).set('Authorization', tier1)
    expect(one.status).toBe(404)
  })

  it('a deleted collection takes its photos with it — they never fall back to plain assets', async () => {
    const { id } = await seedCollectionWithPhotos(2)
    const del = await request(app).delete(`/api/collections/${id}`).set('Authorization', admin)
    expect(del.status).toBe(200)
    expect((db.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number }).n).toBe(0)
  })
})

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('GET /api/collections — visibility by tier', () => {
  it('401 without auth', async () => {
    expect((await request(app).get('/api/collections')).status).toBe(401)
  })

  it('partners see released collections only; drafts and scheduled ones 404 for them', async () => {
    const draft = await seedCollectionWithPhotos(1)
    const scheduled = await seedCollectionWithPhotos(1)
    await request(app).put(`/api/collections/${scheduled.id}/schedule`).set('Authorization', admin)
      .send({ release_at: new Date(Date.now() + 86_400_000).toISOString() })
    const released = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${released.id}/release`).set('Authorization', admin)

    for (const [uid, role] of [[tier1Id, 'tier1'], [tier2Id, 'tier2'], [tier4Id, 'tier4']] as const) {
      const auth = bearerToken(uid, role)
      const list = await request(app).get('/api/collections').set('Authorization', auth)
      expect(list.status).toBe(200)
      expect(list.body.map((c: { id: number }) => c.id)).toEqual([released.id])
      expect((await request(app).get(`/api/collections/${draft.id}`).set('Authorization', auth)).status).toBe(404)
      expect((await request(app).get(`/api/collections/${scheduled.id}`).set('Authorization', auth)).status).toBe(404)
      expect((await request(app).get(`/api/collections/${released.id}`).set('Authorization', auth)).status).toBe(200)
    }
  })

  it('admin and Legal see every collection, newest first, and can open drafts', async () => {
    const a = await seedCollectionWithPhotos(1)
    const b = await createCollection({ name: 'Second', brand: 'RIDE' })
    db.prepare("UPDATE asset_collections SET created_at = '2020-01-01 00:00:00' WHERE id = ?").run(a.id)
    for (const auth of [admin, legal]) {
      const list = await request(app).get('/api/collections').set('Authorization', auth)
      expect(list.status).toBe(200)
      expect(list.body.map((c: { id: number }) => c.id)).toEqual([b.id, a.id])
      const detail = await request(app).get(`/api/collections/${a.id}`).set('Authorization', auth)
      expect(detail.status).toBe(200)
      expect(detail.body.photos).toHaveLength(1)
    }
  })

  it('partners see released collections ordered by released_at desc', async () => {
    const older = await seedCollectionWithPhotos(1)
    const newer = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${older.id}/release`).set('Authorization', admin)
    await request(app).post(`/api/collections/${newer.id}/release`).set('Authorization', admin)
    db.prepare("UPDATE asset_collections SET released_at = '2021-01-01 00:00:00' WHERE id = ?").run(older.id)
    const list = await request(app).get('/api/collections').set('Authorization', tier1)
    expect(list.body.map((c: { id: number }) => c.id)).toEqual([newer.id, older.id])
  })

  it('returns the AssetCollection shape with photo_count and a thumbnail cover_url', async () => {
    const { id, photos } = await seedCollectionWithPhotos(2)
    const res = await request(app).get('/api/collections').set('Authorization', admin)
    const c = res.body[0]
    expect(Object.keys(c).sort()).toEqual([
      'brand', 'cover_asset_id', 'cover_url', 'created_at', 'description', 'id', 'name',
      'photo_count', 'release_at', 'released_at', 'status', 'updated_at',
    ])
    expect(c).toMatchObject({ id, photo_count: 2, status: 'draft', cover_asset_id: null })
    expect(c.cover_url).toBe(photos[0].thumbnail_url) // first photo by sort_order
    expect(c).not.toHaveProperty('notified_at')
  })
})

// ─── Create / edit / delete ──────────────────────────────────────────────────

describe('POST / PUT / DELETE /api/collections', () => {
  it('creates a draft (201) and validates name + brand', async () => {
    const c = await createCollection({ name: '  Holiday  ', brand: 'Sliquid', description: 'Ten bottles' })
    expect(c).toMatchObject({ name: 'Holiday', brand: 'Sliquid', status: 'draft', description: 'Ten bottles', photo_count: 0, cover_url: null })
    for (const body of [{ brand: 'Sliquid' }, { name: 'X' }, { name: '   ', brand: 'Sliquid' }, { name: 5, brand: 'Sliquid' }, { name: 'x'.repeat(201), brand: 'S' }]) {
      const res = await request(app).post('/api/collections').set('Authorization', admin).send(body)
      expect(res.status).toBe(400)
    }
  })

  it('edits name/brand/description; a brand change carries to the photos', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    const res = await request(app).put(`/api/collections/${id}`).set('Authorization', admin)
      .send({ name: 'Renamed', brand: 'RIDE', description: null })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Renamed', brand: 'RIDE', description: null })
    const brands = db.prepare('SELECT DISTINCT brand FROM assets WHERE collection_id = ?').all(id)
    expect(brands).toEqual([{ brand: 'RIDE' }])
    expect((await request(app).put(`/api/collections/${id}`).set('Authorization', admin).send({ name: '' })).status).toBe(400)
    expect((await request(app).put('/api/collections/9999').set('Authorization', admin).send({ name: 'x' })).status).toBe(404)
  })

  it('cover must be a photo of this collection', async () => {
    const a = await seedCollectionWithPhotos(2)
    const b = await seedCollectionWithPhotos(1)
    const bad = await request(app).put(`/api/collections/${a.id}`).set('Authorization', admin).send({ cover_asset_id: b.photos[0].id })
    expect(bad.status).toBe(400)
    const ok = await request(app).put(`/api/collections/${a.id}`).set('Authorization', admin).send({ cover_asset_id: a.photos[1].id })
    expect(ok.status).toBe(200)
    expect(ok.body.cover_asset_id).toBe(a.photos[1].id)
    expect(ok.body.cover_url).toBe(a.photos[1].thumbnail_url)
  })

  it('DELETE removes the collection, its rows and both S3 objects per photo', async () => {
    const { id } = await seedCollectionWithPhotos(2)
    const keys = (db.prepare('SELECT s3_key FROM assets WHERE collection_id = ?').all(id) as { s3_key: string }[]).map(r => r.s3_key)
    s3Send.mockClear()
    const res = await request(app).delete(`/api/collections/${id}`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, deleted_photos: 2 })
    expect(deleteKeys().sort()).toEqual([...keys, ...keys.map(k => `${k}-thumb.webp`)].sort())
    expect(db.prepare('SELECT 1 FROM asset_collections WHERE id = ?').get(id)).toBeUndefined()
    expect((await request(app).delete(`/api/collections/${id}`).set('Authorization', admin)).status).toBe(404)
  })

  it('DELETE still succeeds when S3 deletes fail (best effort)', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    s3Send.mockRejectedValue(new Error('S3 down'))
    try {
      const res = await request(app).delete(`/api/collections/${id}`).set('Authorization', admin)
      expect(res.status).toBe(200)
    } finally {
      s3Send.mockReset(); s3Send.mockImplementation(async () => ({}))
    }
  })

  it('DELETE /api/assets/:id on a collection photo also removes its thumbnail object', async () => {
    const { photos } = await seedCollectionWithPhotos(1)
    const { s3_key } = db.prepare('SELECT s3_key FROM assets WHERE id = ?').get(photos[0].id) as { s3_key: string }
    s3Send.mockClear()
    const res = await request(app).delete(`/api/assets/${photos[0].id}`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(deleteKeys().sort()).toEqual([s3_key, `${s3_key}-thumb.webp`].sort())
  })
})

// ─── Photo upload ─────────────────────────────────────────────────────────────

describe('POST /api/collections/:id/photos', () => {
  it('uploads original + webp thumbnail under the collection prefix and returns CollectionPhotos', async () => {
    const c = await createCollection()
    const res = await uploadPhotos(c.id, [{ buf: JPEG, name: 'hero_shot-1.jpg' }, { buf: PNG, name: 'detail.png', type: 'image/png' }])
    expect(res.status).toBe(201)
    expect(res.body.errors).toEqual([])
    expect(res.body.photos).toHaveLength(2)

    const [hero, detail] = res.body.photos
    expect(hero).toMatchObject({ name: 'Hero shot 1', dimensions: '1600x1000', sort_order: 0 })
    expect(detail).toMatchObject({ name: 'Detail', dimensions: '300x200', sort_order: 1 })
    expect(hero.file_size).toMatch(/^\d+\.\d (KB|MB)$/)
    expect(hero.file_url).toMatch(new RegExp(`^https://test-bucket\\.s3\\.us-west-2\\.amazonaws\\.com/portal-assets/collections/${c.id}/[0-9a-f-]+\\.jpg$`))
    expect(hero.thumbnail_url).toBe(`${hero.file_url}-thumb.webp`)

    const puts = s3Send.mock.calls.map(x => x[0] as any).filter(x => x.kind === 'put')
    expect(puts).toHaveLength(4)
    const thumbPut = puts.find(p => p.input.Key.endsWith('-thumb.webp'))
    expect(thumbPut.input.ContentType).toBe('image/webp')
    const meta = await sharp(thumbPut.input.Body as Buffer).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(800)

    const row = db.prepare('SELECT type, brand, collection_id FROM assets WHERE id = ?').get(hero.id)
    expect(row).toEqual({ type: 'Photo', brand: 'Sliquid', collection_id: c.id })
  })

  it('continues sort_order across requests', async () => {
    const c = await createCollection()
    await uploadPhotos(c.id, [{ buf: JPEG, name: 'a.jpg' }])
    const res = await uploadPhotos(c.id, [{ buf: JPEG, name: 'b.jpg' }])
    expect(res.body.photos[0].sort_order).toBe(1)
  })

  it('rejects non-images and unreadable images per file while the rest succeed', async () => {
    const c = await createCollection()
    const res = await uploadPhotos(c.id, [
      { buf: JPEG, name: 'good.jpg' },
      { buf: Buffer.from('%PDF-1.4'), name: 'sheet.pdf', type: 'application/pdf' },
      { buf: Buffer.from('not really a jpeg'), name: 'broken.jpg' },
    ])
    expect(res.status).toBe(201)
    expect(res.body.photos.map((p: { name: string }) => p.name)).toEqual(['Good'])
    expect(res.body.errors.map((e: { file: string }) => e.file)).toEqual(['sheet.pdf', 'broken.jpg'])
    expect(putKeys()).toHaveLength(2) // no orphan object for either failure
  })

  it('400 when every file is rejected, and when no files are sent', async () => {
    const c = await createCollection()
    const res = await uploadPhotos(c.id, [{ buf: Buffer.from('hello'), name: 'notes.txt', type: 'text/plain' }])
    expect(res.status).toBe(400)
    expect(res.body.photos).toEqual([])
    const none = await request(app).post(`/api/collections/${c.id}/photos`).set('Authorization', admin).field('x', '1')
    expect(none.status).toBe(400)
  })

  it('an S3 failure on one file lands in errors[] while the others succeed', async () => {
    const c = await createCollection()
    let n = 0
    s3Send.mockImplementation(async (cmd: any) => {
      if (cmd.kind === 'put' && ++n === 1) throw new Error('S3 hiccup')
      return {}
    })
    try {
      const res = await uploadPhotos(c.id, [{ buf: JPEG, name: 'one.jpg' }, { buf: JPEG, name: 'two.jpg' }])
      expect(res.status).toBe(201)
      expect(res.body.photos.map((p: { name: string }) => p.name)).toEqual(['Two'])
      expect(res.body.errors).toEqual([{ file: 'one.jpg', message: 'S3 hiccup' }])
    } finally {
      s3Send.mockReset(); s3Send.mockImplementation(async () => ({}))
    }
  })

  it('more than 10 files in one request is a 400', async () => {
    const c = await createCollection()
    const res = await uploadPhotos(c.id, Array.from({ length: 11 }, (_, i) => ({ buf: PNG, name: `p${i}.png`, type: 'image/png' })))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/at most 10/)
  })

  it('503 when S3 is not configured', async () => {
    const c = await createCollection()
    const saved = process.env['S3_BUCKET']
    delete process.env['S3_BUCKET']
    try {
      const res = await uploadPhotos(c.id, [{ buf: JPEG, name: 'a.jpg' }])
      expect(res.status).toBe(503)
    } finally { process.env['S3_BUCKET'] = saved }
    expect(putKeys()).toHaveLength(0)
  })

  it('404 for an unknown collection', async () => {
    const res = await uploadPhotos(9999, [{ buf: JPEG, name: 'a.jpg' }])
    expect(res.status).toBe(404)
  })

  it('adding photos to a released collection does not notify again', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    await uploadPhotos(id, [{ buf: JPEG, name: 'late.jpg' }])
    expect(notifCount(tier1Id)).toBe(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
  })
})

// ─── Order ────────────────────────────────────────────────────────────────────

describe('PUT /api/collections/:id/order', () => {
  it('sets sort_order; unlisted photos keep their order after the listed ones', async () => {
    const { id, photos } = await seedCollectionWithPhotos(3)
    const [a, b, c] = photos.map(p => p.id)
    const res = await request(app).put(`/api/collections/${id}/order`).set('Authorization', admin).send({ photo_ids: [c, a, b] })
    expect(res.status).toBe(200)
    expect(res.body.photos.map((p: { id: number }) => p.id)).toEqual([c, a, b])
    const partial = await request(app).put(`/api/collections/${id}/order`).set('Authorization', admin).send({ photo_ids: [b] })
    expect(partial.body.photos.map((p: { id: number }) => p.id)).toEqual([b, c, a])
  })

  it('400 for a foreign photo, duplicates or a bad body', async () => {
    const a = await seedCollectionWithPhotos(1)
    const b = await seedCollectionWithPhotos(1)
    for (const body of [{ photo_ids: [b.photos[0].id] }, { photo_ids: [a.photos[0].id, a.photos[0].id] }, { photo_ids: 'x' }, {}]) {
      expect((await request(app).put(`/api/collections/${a.id}/order`).set('Authorization', admin).send(body)).status).toBe(400)
    }
  })
})

// ─── Schedule ─────────────────────────────────────────────────────────────────

describe('PUT /api/collections/:id/schedule', () => {
  it('stores a future time normalised to SQLite UTC and sets status scheduled', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    const res = await request(app).put(`/api/collections/${id}/schedule`).set('Authorization', admin)
      .send({ release_at: '2099-03-04T05:06:07.000Z' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'scheduled', release_at: '2099-03-04 05:06:07' })
    // An offset is converted to UTC, not stored verbatim.
    const off = await request(app).put(`/api/collections/${id}/schedule`).set('Authorization', admin)
      .send({ release_at: '2099-03-04T10:00:00+02:00' })
    expect(off.body.release_at).toBe('2099-03-04 08:00:00')
  })

  it('null returns a scheduled collection to draft', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    await request(app).put(`/api/collections/${id}/schedule`).set('Authorization', admin).send({ release_at: '2099-01-01T00:00:00Z' })
    const res = await request(app).put(`/api/collections/${id}/schedule`).set('Authorization', admin).send({ release_at: null })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'draft', release_at: null })
  })

  it('400 for a past time, an invalid time, a missing field, no photos, or an already-released collection', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    const empty = await createCollection({ name: 'Empty', brand: 'Sliquid' })
    const put = (cid: number, body: object) => request(app).put(`/api/collections/${cid}/schedule`).set('Authorization', admin).send(body)
    expect((await put(id, { release_at: '2001-01-01T00:00:00Z' })).status).toBe(400)
    expect((await put(id, { release_at: 'next tuesday' })).status).toBe(400)
    expect((await put(id, {})).status).toBe(400)
    expect((await put(empty.id, { release_at: '2099-01-01T00:00:00Z' })).status).toBe(400)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect((await put(id, { release_at: '2099-01-01T00:00:00Z' })).status).toBe(400)
    expect(db.prepare('SELECT status FROM asset_collections WHERE id = ?').get(id)).toEqual({ status: 'released' })
  })
})

// ─── Release / unrelease / notifications ─────────────────────────────────────

describe('release → exactly one notification', () => {
  it('release now: one new_asset notification per partner, none for admins, one broadcast', async () => {
    const { id } = await seedCollectionWithPhotos(3)
    const res = await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'released', notified: true })
    expect(res.body.released_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    expect(notifCount(tier1Id)).toBe(1)
    expect(notifCount(tier2Id)).toBe(1)
    expect(notifCount(adminId)).toBe(0)
    const n = db.prepare('SELECT title, message, link, i18n_key, i18n_params FROM notifications WHERE user_id = ?').get(tier1Id) as any
    expect(n).toMatchObject({
      title: 'New collection released',
      message: 'Fall Launch (Sliquid) — 3 new photos in the Product Library.',
      link: `/assets?collection=${id}`,
      i18n_key: 'collectionReleased',
    })
    expect(JSON.parse(n.i18n_params)).toEqual({ name: 'Fall Launch', brand: 'Sliquid', count: 3 })
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith({ assetName: 'Fall Launch', brand: 'Sliquid' })
  })

  it('only notifies accounts that can open the Product Library — not Prospects or pending users', async () => {
    const pendingId = seedPendingUser()
    const { id } = await seedCollectionWithPhotos(2)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect(notifCount(tier1Id)).toBe(1)
    // tier4 (Prospect) and status='pending' accounts are bounced from /assets by
    // Shell.tsx, so a notification linking there would be a dead end.
    expect(notifCount(tier4Id)).toBe(0)
    expect(notifCount(pendingId)).toBe(0)
  })

  it('names the Ride Lube line by its display name, not the stored RIDE key', async () => {
    const { id } = await seedCollectionWithPhotos(2)
    db.prepare("UPDATE asset_collections SET brand = 'RIDE' WHERE id = ?").run(id)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const n = db.prepare('SELECT message, i18n_params FROM notifications WHERE user_id = ?').get(tier1Id) as any
    expect(n.message).toContain('(Ride Lube)')
    expect(JSON.parse(n.i18n_params).brand).toBe('Ride Lube')
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ brand: 'Ride Lube' }))
  })

  it('singular wording for a one-photo collection', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const n = db.prepare('SELECT message FROM notifications WHERE user_id = ?').get(tier1Id) as { message: string }
    expect(n.message).toBe('Fall Launch (Sliquid) — 1 new photo in the Product Library.')
  })

  it('the partner sees it in their own feed (new_asset is user-visible)', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const feed = await request(app).get('/api/notifications').set('Authorization', tier1)
    expect(feed.body.notifications).toHaveLength(1)
    expect(feed.body.notifications[0].i18n_key).toBe('collectionReleased')
  })

  it('a second release is a 200 no-op and never re-notifies', async () => {
    const { id } = await seedCollectionWithPhotos(2)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const again = await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect(again.status).toBe(200)
    expect(again.body.notified).toBe(false)
    expect(notifCount(tier1Id)).toBe(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
  })

  it('400 when releasing a collection with no photos; 404 for an unknown one', async () => {
    const c = await createCollection()
    expect((await request(app).post(`/api/collections/${c.id}/release`).set('Authorization', admin)).status).toBe(400)
    expect((await request(app).post('/api/collections/9999/release').set('Authorization', admin)).status).toBe(404)
    expect(notifCount(tier1Id)).toBe(0)
  })

  it('unrelease hides it from partners; re-release does not notify a second time', async () => {
    const { id } = await seedCollectionWithPhotos(2)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    const un = await request(app).post(`/api/collections/${id}/unrelease`).set('Authorization', admin)
    expect(un.status).toBe(200)
    expect(un.body.status).toBe('draft')
    expect(un.body.message).toMatch(/will not send another notification/)
    expect((await request(app).get(`/api/collections/${id}`).set('Authorization', tier1)).status).toBe(404)
    expect((await request(app).get('/api/collections').set('Authorization', tier1)).body).toEqual([])

    const re = await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect(re.status).toBe(200)
    expect(re.body).toMatchObject({ status: 'released', notified: false })
    expect(notifCount(tier1Id)).toBe(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
  })
})

describe('sweepScheduledCollections()', () => {
  it('releases only the due scheduled collections, notifies once, and is idempotent', async () => {
    const due = await seedCollectionWithPhotos(1)
    const future = await seedCollectionWithPhotos(1)
    const draft = await seedCollectionWithPhotos(1)
    db.prepare("UPDATE asset_collections SET status = 'scheduled', release_at = '2020-01-01 00:00:00' WHERE id = ?").run(due.id)
    db.prepare("UPDATE asset_collections SET status = 'scheduled', release_at = '2099-01-01 00:00:00' WHERE id = ?").run(future.id)
    // A draft with a stale past release_at must NOT be swept.
    db.prepare("UPDATE asset_collections SET release_at = '2020-01-01 00:00:00' WHERE id = ?").run(draft.id)

    expect(sweepScheduledCollections()).toBe(1)
    const status = (id: number) => (db.prepare('SELECT status FROM asset_collections WHERE id = ?').get(id) as { status: string }).status
    expect([status(due.id), status(future.id), status(draft.id)]).toEqual(['released', 'scheduled', 'draft'])
    expect(notifCount(tier1Id)).toBe(1)
    expect(broadcast).toHaveBeenCalledTimes(1)

    expect(sweepScheduledCollections()).toBe(0)
    expect(notifCount(tier1Id)).toBe(1)
    expect(broadcast).toHaveBeenCalledTimes(1)
  })

  it('a click and the sweep cannot both send', async () => {
    const { id } = await seedCollectionWithPhotos(1)
    db.prepare("UPDATE asset_collections SET status = 'scheduled', release_at = '2020-01-01 00:00:00' WHERE id = ?").run(id)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    expect(sweepScheduledCollections()).toBe(0)
    expect(notifCount(tier1Id)).toBe(1)
  })

  it('returns a due collection with no photos to draft instead of announcing it', async () => {
    const c = await createCollection()
    db.prepare("UPDATE asset_collections SET status = 'scheduled', release_at = '2020-01-01 00:00:00' WHERE id = ?").run(c.id)
    expect(sweepScheduledCollections()).toBe(0)
    expect(db.prepare('SELECT status FROM asset_collections WHERE id = ?').get(c.id)).toEqual({ status: 'draft' })
    expect(notifCount(tier1Id)).toBe(0)
  })
})

// ─── Download ─────────────────────────────────────────────────────────────────

describe('GET /api/assets/:id/download', () => {
  function stubFetch(body = 'BYTES', status = 200) {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(status === 200 ? body : 'nope', { status, headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', f)
    return f
  }

  it('builds the URL from env + s3_key, never from file_url, and sends an attachment', async () => {
    const { id, photos } = await seedCollectionWithPhotos(1)
    await request(app).post(`/api/collections/${id}/release`).set('Authorization', admin)
    db.prepare("UPDATE assets SET file_url = 'http://169.254.169.254/latest/meta-data' WHERE id = ?").run(photos[0].id)
    const { s3_key } = db.prepare('SELECT s3_key FROM assets WHERE id = ?').get(photos[0].id) as { s3_key: string }

    const f = stubFetch()
    const res = await request(app).get(`/api/assets/${photos[0].id}/download`).set('Authorization', tier1)
      .buffer(true).parse((r, cb) => { let d = ''; r.on('data', c => { d += c }); r.on('end', () => cb(null, d)) })
    expect(res.status).toBe(200)
    expect(res.body).toBe('BYTES')
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Shot 1\.jpg"/)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe(`https://test-bucket.s3.us-west-2.amazonaws.com/${s3_key}`)
    expect(f.mock.calls[0][1]?.redirect).toBe('error')
  })

  it('a draft collection photo 404s for a partner (no fetch) but downloads for admin and Legal', async () => {
    const { photos } = await seedCollectionWithPhotos(1)
    const f = stubFetch()
    expect((await request(app).get(`/api/assets/${photos[0].id}/download`).set('Authorization', tier1)).status).toBe(404)
    expect(f).not.toHaveBeenCalled()
    expect((await request(app).get(`/api/assets/${photos[0].id}/download`).set('Authorization', admin)).status).toBe(200)
    expect((await request(app).get(`/api/assets/${photos[0].id}/download`).set('Authorization', legal)).status).toBe(200)
  })

  it('404 when the asset has no s3_key (and never fetches its file_url)', async () => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO assets (name, brand, type, file_url) VALUES ('Linked', 'Sliquid', 'Logo', 'https://evil.example/x')"
    ).run()
    const f = stubFetch()
    const res = await request(app).get(`/api/assets/${lastInsertRowid}/download`).set('Authorization', tier1)
    expect(res.status).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })

  it('a plain S3-backed asset downloads for any partner; 401 without auth; 502 on upstream failure', async () => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO assets (name, brand, type, file_url, s3_key) VALUES ('Logo', 'Sliquid', 'Logo', 'https://x', 'portal-assets/assets/abc.png')"
    ).run()
    stubFetch()
    const ok = await request(app).get(`/api/assets/${lastInsertRowid}/download`).set('Authorization', tier1)
    expect(ok.status).toBe(200)
    expect(ok.headers['content-disposition']).toMatch(/filename="Logo\.png"/)
    expect((await request(app).get(`/api/assets/${lastInsertRowid}/download`)).status).toBe(401)
    stubFetch('', 500)
    expect((await request(app).get(`/api/assets/${lastInsertRowid}/download`).set('Authorization', tier1)).status).toBe(502)
  })
})

// ─── Write guards ─────────────────────────────────────────────────────────────

describe('write guards — Legal and partners are 403 on every write', () => {
  it('rejects every write route for tier8 and tier1 and changes nothing', async () => {
    const { id, photos } = await seedCollectionWithPhotos(1)
    const writes = [
      () => request(app).post('/api/collections').send({ name: 'X', brand: 'Y' }),
      () => request(app).put(`/api/collections/${id}`).send({ name: 'Hacked' }),
      () => request(app).delete(`/api/collections/${id}`),
      () => request(app).post(`/api/collections/${id}/photos`).attach('files', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' }),
      () => request(app).put(`/api/collections/${id}/order`).send({ photo_ids: [photos[0].id] }),
      () => request(app).put(`/api/collections/${id}/schedule`).send({ release_at: '2099-01-01T00:00:00Z' }),
      () => request(app).post(`/api/collections/${id}/release`),
      () => request(app).post(`/api/collections/${id}/unrelease`),
    ]
    for (const auth of [legal, tier1]) {
      for (const w of writes) {
        const res = await w().set('Authorization', auth)
        expect(res.status).toBe(403)
      }
    }
    expect(db.prepare('SELECT name, status FROM asset_collections WHERE id = ?').get(id)).toEqual({ name: 'Fall Launch', status: 'draft' })
    expect((db.prepare('SELECT COUNT(*) AS n FROM asset_collections').get() as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number }).n).toBe(0)
  })
})
