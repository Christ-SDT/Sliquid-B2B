import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDb, seedProduct, seedPackshot, seedMediaItem } from './helpers/db.js'
import {
  searchPackshots,
  getPackshotByAssetId,
  listPackshotSizes,
} from '../packshots.js'

beforeEach(() => {
  resetDb()
})

describe('migration v56 — packshot catalog columns', () => {
  it('adds every packshot column to media', () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('media')").all() as { name: string }[])
      .map(c => c.name)
    for (const col of [
      'sku', 'unit_size', 'package_version', 'packshot_status',
      'approved', 'sha256', 'asset_key',
    ]) {
      expect(cols).toContain(col)
    }
  })

  it('defaults approved to 0 so a new row is never served', () => {
    seedMediaItem()
    const row = db.prepare('SELECT approved FROM media LIMIT 1').get() as { approved: number }
    expect(row.approved).toBe(0)
  })

  it('creates the asset_key and lookup indexes', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
      .map(i => i.name)
    expect(names).toContain('idx_media_asset_key')
    expect(names).toContain('idx_media_packshot_lookup')
  })

  it('enforces UNIQUE asset_key but allows many NULLs (partial index)', () => {
    seedPackshot({ asset_key: 'h2o-4-2-oz-2025' })
    expect(() => seedPackshot({ asset_key: 'h2o-4-2-oz-2025' })).toThrow()

    // Non-packshot media rows all hold NULL and must not collide.
    expect(() => {
      seedPackshot({ asset_key: null })
      seedPackshot({ asset_key: null })
    }).not.toThrow()
  })
})

describe('the approval gate', () => {
  it('hides an unapproved packshot from search', () => {
    seedPackshot({ label: 'Sliquid H2O', approved: 0, asset_key: 'h2o-unapproved' })
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(0)
    expect(searchPackshots({ product: 'H2O', includeInactive: true })).toHaveLength(0)
  })

  it('hides an unapproved packshot from a direct asset_id lookup', () => {
    seedPackshot({ label: 'Sliquid H2O', approved: 0, asset_key: 'h2o-unapproved' })
    expect(getPackshotByAssetId('h2o-unapproved')).toBeNull()
  })

  it('hides an unapproved packshot from listPackshotSizes', () => {
    seedProduct({ name: 'Sliquid H2O', sku: 'H2O-42', unit_size: '4.2 oz' })
    seedPackshot({ sku: 'H2O-42', unit_size: '4.2 oz', approved: 0 })
    expect(listPackshotSizes('H2O-42')).toEqual([])
  })

  it('ignores media rows that are not packshots', () => {
    // Approved, but type is not 'packshot' — must stay out of the catalog.
    seedPackshot({ label: 'Sliquid H2O', type: 'logo', asset_key: 'h2o-logo' })
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(0)
    expect(getPackshotByAssetId('h2o-logo')).toBeNull()
  })

  it('returns an approved active packshot', () => {
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o-4-2-oz-2025' })
    const results = searchPackshots({ product: 'H2O' })
    expect(results).toHaveLength(1)
    expect(results[0].asset_id).toBe('h2o-4-2-oz-2025')
  })
})

describe('status filtering', () => {
  beforeEach(() => {
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o-active', packshot_status: 'active' })
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o-disc', packshot_status: 'discontinued' })
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o-pending', packshot_status: 'pending_approval' })
  })

  it('returns only active rows by default', () => {
    const results = searchPackshots({ product: 'H2O' })
    expect(results.map(r => r.asset_id)).toEqual(['h2o-active'])
  })

  it('includes discontinued and pending with includeInactive', () => {
    const ids = searchPackshots({ product: 'H2O', includeInactive: true }).map(r => r.asset_id)
    expect(ids).toHaveLength(3)
    expect(ids).toContain('h2o-disc')
    expect(ids).toContain('h2o-pending')
  })

  it('orders active first when inactive rows are included', () => {
    const results = searchPackshots({ product: 'H2O', includeInactive: true })
    expect(results[0].asset_id).toBe('h2o-active')
  })

  it('finds a discontinued packshot by asset_id even though search hides it', () => {
    expect(searchPackshots({ product: 'H2O' }).map(r => r.asset_id)).not.toContain('h2o-disc')
    const found = getPackshotByAssetId('h2o-disc')
    expect(found?.status).toBe('discontinued')
  })

  it("treats a NULL packshot_status as 'active'", () => {
    resetDb()
    seedPackshot({ label: 'Sliquid Sassy', asset_key: 'sassy-null', packshot_status: null })
    const results = searchPackshots({ product: 'Sassy' })
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('active')
  })
})

describe('numeric size matching', () => {
  it("matches '4 oz' against the catalog's '4.2 oz'", () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '4.2 oz', asset_key: 'h2o-42' })
    expect(searchPackshots({ product: 'H2O', size: '4 oz' })).toHaveLength(1)
  })

  it("matches '8 oz' against '8.5 oz'", () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '8.5 oz', asset_key: 'h2o-85' })
    expect(searchPackshots({ product: 'H2O', size: '8 oz' })).toHaveLength(1)
  })

  it("treats '2 oz' and '2.0 oz' as the same size", () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '2.0 oz', asset_key: 'h2o-20' })
    seedPackshot({ label: 'Sliquid Sassy', unit_size: '2 oz', asset_key: 'sassy-2' })

    expect(searchPackshots({ product: 'H2O', size: '2 oz' })).toHaveLength(1)
    expect(searchPackshots({ product: 'Sassy', size: '2.0 oz' })).toHaveLength(1)
  })

  it('excludes sizes outside the ±1 oz tolerance', () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '8.5 oz', asset_key: 'h2o-85' })
    expect(searchPackshots({ product: 'H2O', size: '4 oz' })).toHaveLength(0)
  })

  it('picks the right variant out of a multi-size family', () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '2 oz', asset_key: 'h2o-2' })
    seedPackshot({ label: 'Sliquid H2O', unit_size: '4.2 oz', asset_key: 'h2o-42' })
    seedPackshot({ label: 'Sliquid H2O', unit_size: '8.5 oz', asset_key: 'h2o-85' })

    expect(searchPackshots({ product: 'H2O', size: '4 oz' }).map(r => r.asset_id)).toEqual(['h2o-42'])
    expect(searchPackshots({ product: 'H2O', size: '8.5 oz' }).map(r => r.asset_id)).toEqual(['h2o-85'])
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(3)
  })

  it('does not match a sizeless packshot when a size is requested', () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: null, asset_key: 'h2o-nosize' })
    expect(searchPackshots({ product: 'H2O', size: '4 oz' })).toHaveLength(0)
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(1)
  })

  it('falls back to string comparison for non-numeric sizes', () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: 'Travel', asset_key: 'h2o-travel' })
    expect(searchPackshots({ product: 'H2O', size: 'travel' })).toHaveLength(1)
    expect(searchPackshots({ product: 'H2O', size: 'gallon' })).toHaveLength(0)
  })

  it('borrows the size from products when the media row has none', () => {
    seedProduct({ name: 'Sliquid H2O', sku: 'H2O-42', unit_size: '4.2 oz' })
    seedPackshot({ sku: 'H2O-42', unit_size: null, asset_key: 'h2o-join' })
    const results = searchPackshots({ product: 'H2O', size: '4 oz' })
    expect(results).toHaveLength(1)
    expect(results[0].size).toBe('4.2 oz')
  })
})

describe('product enrichment via LEFT JOIN products', () => {
  it('prefers products.name and pulls category + upc', () => {
    seedProduct({ name: 'Sliquid H2O Original', brand: 'Sliquid', category: 'Lubricant', sku: 'H2O-42' })
    db.prepare('UPDATE products SET upc = ? WHERE sku = ?').run('012345678905', 'H2O-42')
    seedPackshot({ label: 'ignore-me', sku: 'H2O-42', unit_size: '4.2 oz', asset_key: 'h2o-42', sha256: 'abc123' })

    const [rec] = searchPackshots({ product: 'H2O' })
    expect(rec.product).toBe('Sliquid H2O Original')
    expect(rec.category).toBe('Lubricant')
    expect(rec.upc).toBe('012345678905')
    expect(rec.sku).toBe('H2O-42')
    expect(rec.sha256).toBe('abc123')
    expect(rec.s3_key).toBeTruthy()
    expect(rec.mime_type).toBe('image/png')
  })

  it('tolerates a null sku — discontinued items have no product row', () => {
    seedPackshot({
      label: 'Sliquid Ice (discontinued)',
      sku: null,
      packshot_status: 'discontinued',
      asset_key: 'ice-legacy',
    })

    const [rec] = searchPackshots({ product: 'Ice', includeInactive: true })
    expect(rec).toBeDefined()
    expect(rec.sku).toBeNull()
    expect(rec.product).toBe('Sliquid Ice (discontinued)')
    expect(rec.category).toBeNull()
    expect(rec.upc).toBeNull()
    expect(getPackshotByAssetId('ice-legacy')?.sku).toBeNull()
  })

  it('tolerates a sku with no matching product row', () => {
    seedPackshot({ label: 'Sliquid Orphan', sku: 'NO-SUCH-SKU', asset_key: 'orphan' })
    const [rec] = searchPackshots({ product: 'Orphan' })
    expect(rec.sku).toBe('NO-SUCH-SKU')
    expect(rec.product).toBe('Sliquid Orphan')
    expect(rec.category).toBeNull()
  })

  it('never exposes file_url or any PII-bearing field', () => {
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o' })
    const [rec] = searchPackshots({ product: 'H2O' })
    expect(Object.keys(rec).sort()).toEqual([
      'asset_id', 'brand', 'category', 'filename', 'media_id', 'mime_type',
      'package_version', 'product', 's3_key', 'sha256', 'size', 'sku', 'status', 'upc',
    ])
    expect(JSON.stringify(rec)).not.toContain('amazonaws.com')
  })
})

describe('product token matching', () => {
  beforeEach(() => {
    seedPackshot({ label: 'Sliquid Naturals H2O', brand: 'Sliquid', asset_key: 'h2o' })
    seedPackshot({ label: 'Sliquid Naturals Sassy', brand: 'Sliquid', asset_key: 'sassy' })
    seedPackshot({ label: 'Ride Silicone', brand: 'RIDE', asset_key: 'ride' })
  })

  it('is case-insensitive', () => {
    expect(searchPackshots({ product: 'sliquid NATURALS h2o' }).map(r => r.asset_id)).toEqual(['h2o'])
  })

  it('is order-independent', () => {
    expect(searchPackshots({ product: 'h2o naturals' }).map(r => r.asset_id)).toEqual(['h2o'])
  })

  it('requires every token to match', () => {
    expect(searchPackshots({ product: 'naturals ride' })).toHaveLength(0)
  })

  it('matches a partial token across the family', () => {
    expect(searchPackshots({ product: 'naturals' })).toHaveLength(2)
  })

  it('matches on brand', () => {
    expect(searchPackshots({ product: 'ride' }).map(r => r.asset_id)).toEqual(['ride'])
  })

  it('returns nothing for a product string with no alphanumerics', () => {
    expect(searchPackshots({ product: '   ' })).toHaveLength(0)
    expect(searchPackshots({ product: '%' })).toHaveLength(0)
    expect(searchPackshots({ product: '' })).toHaveLength(0)
  })

  it('does not treat LIKE wildcards as wildcards', () => {
    // '%%%' would match everything if it reached SQL as a pattern.
    expect(searchPackshots({ product: '%%%' })).toHaveLength(0)
  })
})

describe('SQL injection resistance', () => {
  it('returns no rows and does not throw for an injection attempt', () => {
    seedPackshot({ label: 'Sliquid H2O', asset_key: 'h2o' })

    let results: unknown[] = []
    expect(() => {
      results = searchPackshots({ product: "'; DROP TABLE media; --" })
    }).not.toThrow()
    expect(results).toHaveLength(0)

    // The table is still there and the row survived.
    expect(db.prepare('SELECT COUNT(*) AS c FROM media').get()).toEqual({ c: 1 })
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(1)
  })

  it('does not let an injection bypass the approval gate', () => {
    seedPackshot({ label: 'Secret', approved: 0, asset_key: 'secret' })
    expect(searchPackshots({ product: "x' OR '1'='1" })).toHaveLength(0)
    expect(getPackshotByAssetId("secret' OR '1'='1")).toBeNull()
  })

  it('survives injection attempts in size and asset id', () => {
    seedPackshot({ label: 'Sliquid H2O', unit_size: '4.2 oz', asset_key: 'h2o' })
    expect(() => searchPackshots({ product: 'H2O', size: "'; DELETE FROM media; --" })).not.toThrow()
    expect(() => getPackshotByAssetId("'; DELETE FROM media; --")).not.toThrow()
    expect(db.prepare('SELECT COUNT(*) AS c FROM media').get()).toEqual({ c: 1 })
  })
})

describe('limit', () => {
  beforeEach(() => {
    for (let i = 0; i < 60; i++) seedPackshot({ label: `Sliquid H2O ${i}`, asset_key: `h2o-${i}` })
  })

  it('defaults to 25', () => {
    expect(searchPackshots({ product: 'H2O' })).toHaveLength(25)
  })

  it('honours a smaller explicit limit', () => {
    expect(searchPackshots({ product: 'H2O', limit: 3 })).toHaveLength(3)
  })

  it('caps at 50 however large the request', () => {
    expect(searchPackshots({ product: 'H2O', limit: 500 })).toHaveLength(50)
    expect(searchPackshots({ product: 'H2O', limit: Number.MAX_SAFE_INTEGER })).toHaveLength(50)
  })

  it('falls back to the default for a nonsense limit', () => {
    expect(searchPackshots({ product: 'H2O', limit: 0 })).toHaveLength(25)
    expect(searchPackshots({ product: 'H2O', limit: -5 })).toHaveLength(25)
    expect(searchPackshots({ product: 'H2O', limit: NaN })).toHaveLength(25)
  })

  it('applies the limit after size filtering, not before', () => {
    // 60 sizeless rows already seeded; only one carries a 4.2 oz size, and it
    // sorts last by id. A SQL-side LIMIT would slice it off.
    seedPackshot({ label: 'Sliquid H2O rare', unit_size: '4.2 oz', asset_key: 'h2o-rare' })
    const results = searchPackshots({ product: 'H2O', size: '4 oz' })
    expect(results.map(r => r.asset_id)).toEqual(['h2o-rare'])
  })
})

describe('getPackshotByAssetId', () => {
  it('returns the full record for a known asset id', () => {
    seedProduct({ name: 'Sliquid H2O', sku: 'H2O-42', category: 'Lubricant' })
    seedPackshot({
      sku: 'H2O-42', unit_size: '4.2 oz', package_version: '2025',
      asset_key: 'h2o-4-2-oz-2025', sha256: 'deadbeef',
    })

    const rec = getPackshotByAssetId('h2o-4-2-oz-2025')
    expect(rec).not.toBeNull()
    expect(rec!.asset_id).toBe('h2o-4-2-oz-2025')
    expect(rec!.product).toBe('Sliquid H2O')
    expect(rec!.size).toBe('4.2 oz')
    expect(rec!.package_version).toBe('2025')
    expect(rec!.status).toBe('active')
    expect(rec!.media_id).toBeGreaterThan(0)
  })

  it('returns null for an unknown, empty, or whitespace asset id', () => {
    seedPackshot({ asset_key: 'h2o' })
    expect(getPackshotByAssetId('nope')).toBeNull()
    expect(getPackshotByAssetId('')).toBeNull()
    expect(getPackshotByAssetId('   ')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    seedPackshot({ asset_key: 'h2o-4-2-oz-2025' })
    expect(getPackshotByAssetId('  h2o-4-2-oz-2025  ')?.asset_id).toBe('h2o-4-2-oz-2025')
  })
})

describe('listPackshotSizes', () => {
  it('lists distinct sizes ascending', () => {
    seedPackshot({ sku: 'H2O', unit_size: '8.5 oz' })
    seedPackshot({ sku: 'H2O', unit_size: '2 oz' })
    seedPackshot({ sku: 'H2O', unit_size: '4.2 oz' })
    expect(listPackshotSizes('H2O')).toEqual(['2 oz', '4.2 oz', '8.5 oz'])
  })

  it("collapses the '2 oz' / '2.0 oz' double spelling", () => {
    seedPackshot({ sku: 'H2O', unit_size: '2 oz' })
    seedPackshot({ sku: 'H2O', unit_size: '2.0 oz' })
    expect(listPackshotSizes('H2O')).toEqual(['2 oz'])
  })

  it('skips rows with no size', () => {
    seedPackshot({ sku: 'H2O', unit_size: null })
    seedPackshot({ sku: 'H2O', unit_size: '4.2 oz' })
    expect(listPackshotSizes('H2O')).toEqual(['4.2 oz'])
  })

  it('includes discontinued sizes so the agent can name them', () => {
    seedPackshot({ sku: 'H2O', unit_size: '4.2 oz' })
    seedPackshot({ sku: 'H2O', unit_size: '8.5 oz', packshot_status: 'discontinued' })
    expect(listPackshotSizes('H2O')).toEqual(['4.2 oz', '8.5 oz'])
  })

  it('returns an empty array for an unknown, empty, or whitespace sku', () => {
    seedPackshot({ sku: 'H2O', unit_size: '4.2 oz' })
    expect(listPackshotSizes('NOPE')).toEqual([])
    expect(listPackshotSizes('')).toEqual([])
    expect(listPackshotSizes('   ')).toEqual([])
  })
})
