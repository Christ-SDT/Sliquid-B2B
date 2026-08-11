import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { db, resetDb, seedTestUsers, seedProduct } from './helpers/db.js'
import { bearerToken } from './helpers/auth.js'
import {
  parseSize,
  deriveRewardProducts,
  getRewardOptions,
  DEFAULT_SHIRT_SIZES,
} from '../rewardOptions.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

describe('parseSize', () => {
  // The real catalog contains '4.2 oz' and '8.5 oz' — there is no literal
  // '4 oz'/'8 oz' — and 2oz is spelled two ways. Parsing must be numeric.
  it('parses the real catalog formats', () => {
    expect(parseSize('4.2 oz')).toBe(4.2)
    expect(parseSize('8.5 oz')).toBe(8.5)
    expect(parseSize('.17 oz')).toBe(0.17)
    expect(parseSize('1 oz')).toBe(1)
    expect(parseSize('3.4 oz')).toBe(3.4)
  })

  it("treats '2 oz' and '2.0 oz' as the same size", () => {
    expect(parseSize('2 oz')).toBe(parseSize('2.0 oz'))
  })

  it('returns null for missing or unparseable sizes', () => {
    expect(parseSize(null)).toBeNull()
    expect(parseSize('')).toBeNull()
    expect(parseSize('one ounce')).toBeNull()
  })
})

describe('deriveRewardProducts', () => {
  it('prefers the ~4 oz variant over 8.5 oz and 2 oz', () => {
    seedProduct({ name: 'Naturals H2O', sku: 'A1', unit_size: '4.2 oz' })
    seedProduct({ name: 'Naturals H2O', sku: 'A2', unit_size: '8.5 oz' })
    seedProduct({ name: 'Naturals H2O', sku: 'A3', unit_size: '2.0 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].sku).toBe('A1')
    expect(out[0].unitSize).toBe('4.2 oz')
    expect(out[0].label).toBe('Naturals H2O (4.2 oz)')
  })

  it('falls back to the ~8 oz variant when no 4 oz exists', () => {
    seedProduct({ name: 'Balance Soak', sku: 'B1', unit_size: '8.5 oz' })
    seedProduct({ name: 'Balance Soak', sku: 'B2', unit_size: '2.0 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].sku).toBe('B1')
  })

  it('shows the only size when a product has just one', () => {
    seedProduct({ name: 'Rise Stimulating Gel', sku: 'C1', unit_size: '1 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].unitSize).toBe('1 oz')
  })

  it('keeps same-named products from different brands separate', () => {
    seedProduct({ name: 'Silicone', brand: 'RIDE', sku: 'D1', unit_size: '4.2 oz' })
    seedProduct({ name: 'Silicone', brand: 'Ride Rocco', sku: 'D2', unit_size: '4.2 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(2)
    expect(out.map(p => p.brand).sort()).toEqual(['RIDE', 'Ride Rocco'])
  })

  it('tolerates a null unit_size (Woo auto-imports set none)', () => {
    seedProduct({ name: 'Imported Thing', sku: 'E1', unit_size: null })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Imported Thing')
    expect(out[0].unitSize).toBeNull()
  })

  it('picks a sized variant over an unsized sibling', () => {
    seedProduct({ name: 'Mixed', sku: 'F1', unit_size: null })
    seedProduct({ name: 'Mixed', sku: 'F2', unit_size: '4.2 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].sku).toBe('F2')
  })

  it('falls back to the largest size when nothing is near 4 or 8 oz', () => {
    seedProduct({ name: 'Tiny', sku: 'G1', unit_size: '.17 oz' })
    seedProduct({ name: 'Tiny', sku: 'G2', unit_size: '2.0 oz' })

    const out = deriveRewardProducts()
    expect(out).toHaveLength(1)
    expect(out[0].sku).toBe('G2')
  })
})

describe('getRewardOptions', () => {
  it('returns every product when no curation has been saved', () => {
    seedProduct({ name: 'One', sku: 'H1' })
    seedProduct({ name: 'Two', sku: 'H2' })

    expect(getRewardOptions().products).toHaveLength(2)
  })

  it('narrows to the allowed SKUs once curation is saved', () => {
    seedProduct({ name: 'One', sku: 'H1' })
    seedProduct({ name: 'Two', sku: 'H2' })
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('reward_allowed_products', ?)")
      .run(JSON.stringify(['H1']))

    const out = getRewardOptions()
    expect(out.products).toHaveLength(1)
    expect(out.products[0].sku).toBe('H1')
  })

  it('falls back to the full catalog rather than an empty picker on malformed JSON', () => {
    seedProduct({ name: 'One', sku: 'H1' })
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('reward_allowed_products', ?)")
      .run('not json{')

    expect(getRewardOptions().products).toHaveLength(1)
  })

  it('defaults shirt sizes when unset', () => {
    expect(getRewardOptions().shirtSizes).toEqual(DEFAULT_SHIRT_SIZES)
  })
})

describe('GET /api/certificates/reward-options', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/certificates/reward-options')
    expect(res.status).toBe(401)
  })

  it('is available to a partner tier — it drives their reward form', async () => {
    seedProduct({ name: 'One', sku: 'H1' })

    const res = await request(app)
      .get('/api/certificates/reward-options')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body.products).toHaveLength(1)
    expect(res.body.shirtSizes).toEqual(DEFAULT_SHIRT_SIZES)
  })
})

describe('GET /api/certificates/reward-options/all', () => {
  it('returns 403 for a partner tier', async () => {
    const res = await request(app)
      .get('/api/certificates/reward-options/all')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns the full catalog plus null allowedSkus before any curation', async () => {
    seedProduct({ name: 'One', sku: 'H1' })
    seedProduct({ name: 'Two', sku: 'H2' })

    const res = await request(app)
      .get('/api/certificates/reward-options/all')
      .set('Authorization', bearerToken(adminId, 'tier5'))

    expect(res.status).toBe(200)
    expect(res.body.products).toHaveLength(2)
    expect(res.body.allowedSkus).toBeNull()
    expect(res.body.defaultShirtSizes).toEqual(DEFAULT_SHIRT_SIZES)
  })
})

describe('PUT /api/certificates/reward-options', () => {
  it('returns 403 for a partner tier', async () => {
    const res = await request(app)
      .put('/api/certificates/reward-options')
      .send({ products: ['H1'] })
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('saves the product allowlist and narrows what partners see', async () => {
    seedProduct({ name: 'One', sku: 'H1' })
    seedProduct({ name: 'Two', sku: 'H2' })

    const put = await request(app)
      .put('/api/certificates/reward-options')
      .send({ products: ['H2'] })
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(put.status).toBe(200)

    const partner = await request(app)
      .get('/api/certificates/reward-options')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(partner.body.products).toHaveLength(1)
    expect(partner.body.products[0].sku).toBe('H2')
  })

  it('saves shirt sizes independently of products', async () => {
    seedProduct({ name: 'One', sku: 'H1' })
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('reward_allowed_products', ?)")
      .run(JSON.stringify(['H1']))

    await request(app)
      .put('/api/certificates/reward-options')
      .send({ shirtSizes: ['S', 'M'] })
      .set('Authorization', bearerToken(adminId, 'tier5'))

    const res = await request(app)
      .get('/api/certificates/reward-options')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.body.shirtSizes).toEqual(['S', 'M'])
    // The product allowlist must survive a shirt-size-only save.
    expect(res.body.products.map((p: any) => p.sku)).toEqual(['H1'])
  })

  it('rejects a non-array products payload', async () => {
    const res = await request(app)
      .put('/api/certificates/reward-options')
      .send({ products: 'H1' })
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(400)
  })

  it('rejects an empty shirt size list', async () => {
    const res = await request(app)
      .put('/api/certificates/reward-options')
      .send({ shirtSizes: ['  '] })
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.status).toBe(400)
  })
})
