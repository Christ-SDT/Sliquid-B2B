/**
 * Product Library collections — a named, releasable group of photos (e.g. a
 * 50-photo launch). Photos are ordinary `assets` rows with `collection_id` set;
 * they are excluded from the plain `/api/assets` feed and served only through
 * `/api/collections`, so a draft cannot leak into the brand sections.
 *
 * Lifecycle: draft → (scheduled) → released. Releasing sends exactly ONE
 * partner notification + ONE broadcast email per collection, ever:
 * `notified_at` is claimed with a conditional UPDATE, so "Release now" and the
 * 5-minute sweep can never both send, and an unrelease → re-release cycle does
 * not notify a second time.
 */
import { db } from './database.js'
import { notifyUserIds } from './notifications.js'
import { sendBroadcastEmail } from './email.js'
import type { AssetCollection, AssetCollectionDetail, CollectionPhoto, CollectionStatus } from './contracts.js'

/** Thumbnails are stored beside the original, so the key is derivable (no column). */
export function thumbKeyFor(s3Key: string): string {
  return `${s3Key}-thumb.webp`
}

const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.brand, c.description, c.status, c.release_at, c.released_at,
         c.cover_asset_id,
         COALESCE(
           (SELECT COALESCE(a.thumbnail_url, a.file_url) FROM assets a
             WHERE a.id = c.cover_asset_id AND a.collection_id = c.id),
           (SELECT COALESCE(a.thumbnail_url, a.file_url) FROM assets a
             WHERE a.collection_id = c.id ORDER BY a.sort_order, a.id LIMIT 1)
         ) AS cover_url,
         (SELECT COUNT(*) FROM assets a WHERE a.collection_id = c.id) AS photo_count,
         c.created_at, c.updated_at
  FROM asset_collections c`

const PHOTO_SELECT = `
  SELECT id, name, file_url, COALESCE(thumbnail_url, file_url) AS thumbnail_url,
         file_size, dimensions, sort_order
  FROM assets`

interface CollectionRow extends Omit<AssetCollection, 'status'> { status: string }

function toCollection(row: CollectionRow): AssetCollection {
  return { ...row, status: row.status as CollectionStatus }
}

/** All collections. Partners (`includeUnreleased = false`) see released ones only. */
export function listCollections(includeUnreleased: boolean): AssetCollection[] {
  const sql = includeUnreleased
    ? `${COLLECTION_SELECT} ORDER BY c.created_at DESC, c.id DESC`
    : `${COLLECTION_SELECT} WHERE c.status = 'released' ORDER BY c.released_at DESC, c.id DESC`
  return (db.prepare(sql).all() as CollectionRow[]).map(toCollection)
}

export function getCollection(id: number): AssetCollection | null {
  const row = db.prepare(`${COLLECTION_SELECT} WHERE c.id = ?`).get(id) as CollectionRow | undefined
  return row ? toCollection(row) : null
}

export function getCollectionPhotos(id: number): CollectionPhoto[] {
  return db.prepare(`${PHOTO_SELECT} WHERE collection_id = ? ORDER BY sort_order, id`).all(id) as CollectionPhoto[]
}

export function getPhoto(assetId: number): CollectionPhoto | null {
  return (db.prepare(`${PHOTO_SELECT} WHERE id = ?`).get(assetId) as CollectionPhoto | undefined) ?? null
}

export function getCollectionDetail(id: number): AssetCollectionDetail | null {
  const c = getCollection(id)
  return c ? { ...c, photos: getCollectionPhotos(id) } : null
}

export function photoCount(id: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM assets WHERE collection_id = ?').get(id) as { n: number }).n
}

/** English notification text — the client's `notifications:collectionReleased` must match it byte for byte. */
/**
 * Partner-facing brand name. `brand` is a stored key and the Ride Lube line is
 * stored as 'RIDE' (the client's displayBrand() does the same mapping).
 */
export function displayBrand(brand: string): string {
  return brand === 'RIDE' ? 'Ride Lube' : brand
}

export function releaseMessage(name: string, brand: string, count: number): string {
  return `${name} (${brand}) — ${count} new photo${count === 1 ? '' : 's'} in the Product Library.`
}

/**
 * Send the one-and-only release notification. Claims `notified_at` with a
 * conditional UPDATE first (better-sqlite3 is synchronous, so the claim is
 * atomic): whichever caller flips it from NULL sends; every other caller —
 * a concurrent sweep, a second click, a re-release after unrelease — sends nothing.
 * Returns true when this call sent.
 */
/** Tiers whose portal navigation includes /assets (see Shell.tsx allow-lists). */
const LIBRARY_TIERS = ['tier1', 'tier2', 'tier3', 'tier6', 'tier7', 'tier8']

export function notifyRelease(id: number): boolean {
  const claim = db.prepare(
    "UPDATE asset_collections SET notified_at = datetime('now') WHERE id = ? AND notified_at IS NULL"
  ).run(id)
  if (claim.changes !== 1) return false

  const c = getCollection(id)
  if (!c) return false
  // Only accounts that can actually open the Product Library: active (not
  // pending/declined) and a tier whose Shell allow-list includes /assets.
  // Prospects (tier4) and pending users would be bounced to /dashboard by the
  // notification's link. Admins are excluded like notifyUsers() does.
  // Mirrors TIER1/2/3/6_ALLOWED + tier7 + unguarded tier8 in client Shell.tsx.
  const audience = (db.prepare(
    `SELECT id FROM users WHERE status = 'active' AND role IN (${LIBRARY_TIERS.map(() => '?').join(',')})`
  ).all(...LIBRARY_TIERS) as { id: number }[]).map(r => r.id)
  notifyUserIds(
    audience,
    'new_asset',
    'New collection released',
    releaseMessage(c.name, displayBrand(c.brand), c.photo_count),
    `/assets?collection=${c.id}`,
    { key: 'collectionReleased', params: { name: c.name, brand: displayBrand(c.brand), count: c.photo_count } },
  )
  sendBroadcastEmail({ assetName: c.name, brand: displayBrand(c.brand) })
    .catch((err: unknown) => console.error('[email] Collection broadcast failed:', err))
  return true
}

/**
 * Release a collection now. A no-op (returns `released: false`) when it is
 * already released. Never re-notifies — see notifyRelease().
 */
export function releaseCollection(id: number): { released: boolean; notified: boolean } {
  const res = db.prepare(
    `UPDATE asset_collections
        SET status = 'released', released_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status != 'released'`
  ).run(id)
  if (res.changes !== 1) return { released: false, notified: false }
  return { released: true, notified: notifyRelease(id) }
}

/** Release every scheduled collection whose release_at has passed. Returns count. */
export function sweepScheduledCollections(): number {
  const due = db.prepare(
    "SELECT id FROM asset_collections WHERE status = 'scheduled' AND release_at IS NOT NULL AND release_at <= datetime('now')"
  ).all() as { id: number }[]

  let released = 0
  for (const { id } of due) {
    // Photos can be deleted after scheduling; never announce an empty collection.
    if (photoCount(id) === 0) {
      db.prepare(
        "UPDATE asset_collections SET status = 'draft', release_at = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'scheduled'"
      ).run(id)
      console.warn(`[collections] Scheduled collection ${id} has no photos — returned to draft instead of releasing`)
      continue
    }
    if (releaseCollection(id).released) released++
  }
  return released
}
