import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedPackshot, seedProduct } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn().mockResolvedValue({}) })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}))

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

const admin = () => bearerToken(adminId, 'tier5')
const tier1 = () => bearerToken(tier1Id, 'tier1')

// ─── PUT /packshots/:id/status ───────────────────────────────────────────────

describe('PUT /api/media/packshots/:id/status', () => {
  it('403s for a non-admin and leaves the row untouched', async () => {
    const p = seedPackshot({ packshot_status: 'active' })

    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', tier1())
      .send({ status: 'discontinued' })

    expect(res.status).toBe(403)
    const row = db.prepare('SELECT packshot_status FROM media WHERE id = ?').get(p.id) as any
    expect(row.packshot_status).toBe('active')
  })

  it('400s on an unknown status', async () => {
    const p = seedPackshot()
    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', admin())
      .send({ status: 'retired' })

    expect(res.status).toBe(400)
  })

  it('404s for a packshot that does not exist', async () => {
    const res = await request(app)
      .put('/api/media/packshots/99999/status')
      .set('Authorization', admin())
      .send({ status: 'discontinued' })

    expect(res.status).toBe(404)
  })

  it('sets the status and records who changed it', async () => {
    const p = seedPackshot({ packshot_status: 'active' })

    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', admin())
      .send({ status: 'discontinued' })

    expect(res.status).toBe(200)
    expect(res.body.item.packshot_status).toBe('discontinued')
    const row = db.prepare('SELECT status_set_by, status_set_at FROM media WHERE id = ?').get(p.id) as any
    expect(row.status_set_by).toBe('admin@test.com')
    expect(row.status_set_at).toBeTruthy()
  })

  it('does NOT clear approved when discontinuing — the agent must still report it', async () => {
    // search_packshots answers "discontinued" instead of "not found", which is only
    // possible for a row it can still see. Clearing approval here would turn every
    // discontinuation into a silent disappearance.
    const p = seedPackshot({ approved: 1, packshot_status: 'active' })

    await request(app)
      .put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', admin())
      .send({ status: 'discontinued' })

    const row = db.prepare('SELECT approved, packshot_status FROM media WHERE id = ?').get(p.id) as any
    expect(row.approved).toBe(1)
    expect(row.packshot_status).toBe('discontinued')
  })

  it('leaves is_primary intact when discontinuing', async () => {
    const sku = 'SKU-DISC'
    seedProduct({ sku })
    const p = seedPackshot({ sku })
    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })

    await request(app).put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', admin()).send({ status: 'discontinued' })

    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(1)
  })
})

// ─── PUT /packshots/:id/primary ──────────────────────────────────────────────

describe('PUT /api/media/packshots/:id/primary', () => {
  it('403s for a non-admin', async () => {
    const sku = 'SKU-1'
    seedProduct({ sku })
    const p = seedPackshot({ sku })

    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', tier1())
      .send({ primary: true })

    expect(res.status).toBe(403)
    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(0)
  })

  it('400s when primary is not a boolean', async () => {
    const p = seedPackshot({ sku: 'SKU-1' })
    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin())
      .send({ primary: 'yes' })

    expect(res.status).toBe(400)
  })

  it('refuses to mark a packshot with no SKU as primary', async () => {
    const p = seedPackshot({ sku: null })
    const res = await request(app)
      .put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin())
      .send({ primary: true })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no SKU/i)
  })

  it('promotes one packshot and demotes the previous primary for that SKU', async () => {
    const sku = 'SKU-SHARED'
    seedProduct({ sku })
    const first = seedPackshot({ sku })
    const second = seedPackshot({ sku })

    await request(app).put(`/api/media/packshots/${first.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })
    await request(app).put(`/api/media/packshots/${second.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })

    const rows = db.prepare(
      'SELECT id, is_primary FROM media WHERE sku = ? ORDER BY id'
    ).all(sku) as any[]
    expect(rows.map(r => r.is_primary)).toEqual([0, 1])
  })

  it('does not touch another SKU primary', async () => {
    seedProduct({ sku: 'SKU-A' })
    seedProduct({ sku: 'SKU-B' })
    const a = seedPackshot({ sku: 'SKU-A' })
    const b = seedPackshot({ sku: 'SKU-B' })

    await request(app).put(`/api/media/packshots/${a.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })
    await request(app).put(`/api/media/packshots/${b.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })

    const rowA = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(a.id) as any
    expect(rowA.is_primary).toBe(1)
  })

  it('can unset a primary', async () => {
    const sku = 'SKU-OFF'
    seedProduct({ sku })
    const p = seedPackshot({ sku })

    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })
    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: false })

    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(0)
  })

  it('the DB refuses two primaries for one SKU even on a raw write', async () => {
    const sku = 'SKU-IDX'
    const a = seedPackshot({ sku })
    const b = seedPackshot({ sku })
    db.prepare('UPDATE media SET is_primary = 1 WHERE id = ?').run(a.id)

    expect(() =>
      db.prepare('UPDATE media SET is_primary = 1 WHERE id = ?').run(b.id)
    ).toThrow()
  })
})

// ─── GET /packshots/coverage ─────────────────────────────────────────────────

describe('GET /api/media/packshots/coverage', () => {
  it('403s for a non-admin', async () => {
    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', tier1())
    expect(res.status).toBe(403)
  })

  it('lists a product that has no packshot at all', async () => {
    seedProduct({ sku: 'SKU-NONE', name: 'Uncovered Product' })

    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', admin())

    expect(res.status).toBe(200)
    const skus = res.body.missing.map((m: any) => m.sku)
    expect(skus).toContain('SKU-NONE')
    expect(res.body.counts.products_missing).toBe(1)
  })

  it('counts a product whose only packshot is unapproved as still missing', async () => {
    seedProduct({ sku: 'SKU-PENDING' })
    seedPackshot({ sku: 'SKU-PENDING', approved: 0 })

    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', admin())

    const row = res.body.missing.find((m: any) => m.sku === 'SKU-PENDING')
    expect(row).toBeTruthy()
    // It has a packshot, it just isn't published — the distinction the panel shows.
    expect(row.packshot_count).toBe(1)
  })

  it('does not list a product with an approved active packshot', async () => {
    seedProduct({ sku: 'SKU-OK' })
    seedPackshot({ sku: 'SKU-OK', approved: 1, packshot_status: 'active' })

    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', admin())

    expect(res.body.missing.map((m: any) => m.sku)).not.toContain('SKU-OK')
  })

  it('lists packshots whose SKU matches no product as orphaned', async () => {
    seedPackshot({ sku: 'SKU-GHOST' })
    seedPackshot({ sku: null })

    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', admin())

    expect(res.body.orphaned).toHaveLength(2)
    expect(res.body.counts.orphaned).toBe(2)
  })

  it('lists discontinued packshots', async () => {
    seedProduct({ sku: 'SKU-OLD' })
    seedPackshot({ sku: 'SKU-OLD', packshot_status: 'discontinued' })

    const res = await request(app)
      .get('/api/media/packshots/coverage')
      .set('Authorization', admin())

    expect(res.body.discontinued).toHaveLength(1)
    expect(res.body.discontinued[0].packshot_status).toBe('discontinued')
  })
})

// ─── The read path: a primary packshot reaches the catalog ───────────────────

describe('primary packshot propagation to products', () => {
  it('serves the primary packshot as image_url on the public catalog', async () => {
    const sku = 'SKU-IMG'
    seedProduct({ sku, name: 'Imaged Product' })
    const p = seedPackshot({ sku, approved: 1 })
    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })

    const res = await request(app).get('/api/products/catalog')

    const row = res.body.find((r: any) => r.name === 'Imaged Product')
    expect(row.image_url).toBe(p.file_url)
  })

  it('lets an explicit products.image_url win over the packshot', async () => {
    const sku = 'SKU-OVERRIDE'
    seedProduct({ sku, name: 'Override Product' })
    db.prepare('UPDATE products SET image_url = ? WHERE sku = ?')
      .run('https://cdn.example/manual.png', sku)
    const p = seedPackshot({ sku })
    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })

    const res = await request(app).get('/api/products/catalog')

    const row = res.body.find((r: any) => r.name === 'Override Product')
    expect(row.image_url).toBe('https://cdn.example/manual.png')
  })

  it('never leaks an UNAPPROVED primary packshot to the public catalog', async () => {
    const sku = 'SKU-UNAPPROVED'
    seedProduct({ sku, name: 'Unapproved Product' })
    const p = seedPackshot({ sku, approved: 0 })
    // Set primary directly: the endpoint allows it, approval is a separate gate.
    db.prepare('UPDATE media SET is_primary = 1 WHERE id = ?').run(p.id)

    const res = await request(app).get('/api/products/catalog')

    const row = res.body.find((r: any) => r.name === 'Unapproved Product')
    expect(row.image_url).toBeNull()
  })

  it('still serves the image of a discontinued product, flagged as discontinued', async () => {
    const sku = 'SKU-GONE'
    seedProduct({ sku, name: 'Discontinued Product' })
    const p = seedPackshot({ sku, approved: 1 })
    await request(app).put(`/api/media/packshots/${p.id}/primary`)
      .set('Authorization', admin()).send({ primary: true })
    await request(app).put(`/api/media/packshots/${p.id}/status`)
      .set('Authorization', admin()).send({ status: 'discontinued' })

    const res = await request(app).get('/api/products/catalog')

    const row = res.body.find((r: any) => r.name === 'Discontinued Product')
    expect(row.image_url).toBe(p.file_url)
    expect(row.primary_packshot_status).toBe('discontinued')
  })

  it('reports no primary status when a product has no primary packshot', async () => {
    seedProduct({ sku: 'SKU-BARE', name: 'Bare Product' })

    const res = await request(app).get('/api/products/catalog')

    const row = res.body.find((r: any) => r.name === 'Bare Product')
    expect(row.primary_packshot_status).toBeNull()
    expect(row.image_url).toBeNull()
  })
})

// ─── The Products page is the single editor ──────────────────────────────────

describe('product image is chosen from the Products page', () => {
  it('403s for a non-admin', async () => {
    const sku = 'SKU-AUTH'
    const pid = seedProduct({ sku })
    const p = seedPackshot({ sku })

    const res = await request(app)
      .put(`/api/products/${pid}/image`)
      .set('Authorization', tier1())
      .send({ media_id: p.id })

    expect(res.status).toBe(403)
    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(0)
  })

  it('lists the packshot candidates for a SKU', async () => {
    const sku = 'SKU-CAND'
    seedProduct({ sku })
    seedPackshot({ sku, unit_size: '4.2 oz' })
    seedPackshot({ sku, unit_size: '8.5 oz' })
    seedPackshot({ sku: 'SKU-OTHER' })

    const res = await request(app)
      .get(`/api/products/packshot-candidates?sku=${sku}`)
      .set('Authorization', admin())

    expect(res.status).toBe(200)
    expect(res.body.candidates).toHaveLength(2)
    expect(res.body.candidates.map((c: any) => c.unit_size).sort()).toEqual(['4.2 oz', '8.5 oz'])
  })

  it('returns an empty candidate list rather than erroring with no sku', async () => {
    const res = await request(app)
      .get('/api/products/packshot-candidates')
      .set('Authorization', admin())

    expect(res.status).toBe(200)
    expect(res.body.candidates).toEqual([])
  })

  it('sets the product image and marks that packshot primary', async () => {
    const sku = 'SKU-SET'
    const pid = seedProduct({ sku })
    const p = seedPackshot({ sku, approved: 1 })

    const res = await request(app)
      .put(`/api/products/${pid}/image`)
      .set('Authorization', admin())
      .send({ media_id: p.id })

    expect(res.status).toBe(200)
    expect(res.body.product.image_url).toBe(p.file_url)
    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(1)
  })

  it('clears a stale image_url override so the pick is not silently ignored', async () => {
    const sku = 'SKU-STALE'
    const pid = seedProduct({ sku })
    db.prepare('UPDATE products SET image_url = ? WHERE id = ?')
      .run('https://cdn.example/old.png', pid)
    const p = seedPackshot({ sku, approved: 1 })

    const res = await request(app)
      .put(`/api/products/${pid}/image`)
      .set('Authorization', admin())
      .send({ media_id: p.id })

    expect(res.status).toBe(200)
    // Without the clear, the old URL would still outrank the choice just made.
    expect(res.body.product.image_url).toBe(p.file_url)
    const prod = db.prepare('SELECT image_url FROM products WHERE id = ?').get(pid) as any
    expect(prod.image_url).toBeNull()
  })

  it('refuses a packshot belonging to a different SKU', async () => {
    const pid = seedProduct({ sku: 'SKU-MINE' })
    const other = seedPackshot({ sku: 'SKU-THEIRS' })

    const res = await request(app)
      .put(`/api/products/${pid}/image`)
      .set('Authorization', admin())
      .send({ media_id: other.id })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/different SKU/i)
    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(other.id) as any
    expect(row.is_primary).toBe(0)
  })

  it('switching the image demotes the previous choice', async () => {
    const sku = 'SKU-SWITCH'
    const pid = seedProduct({ sku })
    const first = seedPackshot({ sku, approved: 1 })
    const second = seedPackshot({ sku, approved: 1 })

    await request(app).put(`/api/products/${pid}/image`)
      .set('Authorization', admin()).send({ media_id: first.id })
    await request(app).put(`/api/products/${pid}/image`)
      .set('Authorization', admin()).send({ media_id: second.id })

    const rows = db.prepare('SELECT id, is_primary FROM media WHERE sku = ? ORDER BY id')
      .all(sku) as any[]
    expect(rows.map(r => r.is_primary)).toEqual([0, 1])
  })

  it('clearing with media_id null drops both the packshot and the URL override', async () => {
    const sku = 'SKU-CLEAR'
    const pid = seedProduct({ sku })
    const p = seedPackshot({ sku, approved: 1 })
    await request(app).put(`/api/products/${pid}/image`)
      .set('Authorization', admin()).send({ media_id: p.id })
    db.prepare('UPDATE products SET image_url = ? WHERE id = ?')
      .run('https://cdn.example/leftover.png', pid)

    const res = await request(app)
      .put(`/api/products/${pid}/image`)
      .set('Authorization', admin())
      .send({ media_id: null })

    expect(res.status).toBe(200)
    expect(res.body.product.image_url).toBeNull()
    const row = db.prepare('SELECT is_primary FROM media WHERE id = ?').get(p.id) as any
    expect(row.is_primary).toBe(0)
  })

  it('404s for a product that does not exist', async () => {
    const res = await request(app)
      .put('/api/products/99999/image')
      .set('Authorization', admin())
      .send({ media_id: null })

    expect(res.status).toBe(404)
  })

  it('surfaces the chosen image on the inventory list too', async () => {
    const sku = 'SKU-INV'
    const pid = seedProduct({ sku })
    const p = seedPackshot({ sku, approved: 1 })
    db.prepare(
      'INSERT INTO inventory (product_id, product_name, brand, sku, quantity, reorder_level, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(pid, 'Test Product', 'Sliquid', sku, 10, 5, 'in_stock')

    await request(app).put(`/api/products/${pid}/image`)
      .set('Authorization', admin()).send({ media_id: p.id })

    const res = await request(app).get('/api/inventory').set('Authorization', admin())

    const row = res.body.find((r: any) => r.sku === sku)
    expect(row.image_url).toBe(p.file_url)
  })
})
