import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ADMIN_ROLES, canViewAdmin } from '../roles.js'
import { normalizeTs } from '../wordpress.js'
import {
  getS3Client, buildS3Url, deleteS3Object, s3Configured, formatFileSize, nameFromFilename,
} from './assets.js'
import {
  listCollections, getCollection, getCollectionDetail, getCollectionPhotos, getPhoto,
  photoCount, releaseCollection, thumbKeyFor,
} from '../collections.js'
import type { CollectionPhoto, CollectionUploadResult } from '../contracts.js'

/**
 * /api/collections — Product Library collections.
 *
 * Reads: any logged-in tier, but a partner (anyone not `canViewAdmin`) only
 * ever sees `status = 'released'`; a draft/scheduled collection 404s for them.
 * Legal (tier8) reads everything. Writes: `requireRole(...ADMIN_ROLES)` only.
 */
const router = Router()
const requireAdminWrite = requireRole(...ADMIN_ROLES)

const MAX_FILES_PER_REQUEST = 10
const MAX_FILE_SIZE = 750_000_000
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_REQUEST },
})

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.heic': 'image/heic', '.heif': 'image/heif',
}
const ALLOWED_MIME = new Set(Object.values(IMAGE_MIME))

const NAME_MAX = 200
const DESCRIPTION_MAX = 5000

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Reads the collection for `:id`, or answers 404 (also for a partner and an unreleased collection). */
function loadVisible(req: Request, res: Response) {
  const id = parseId(req.params.id)
  const c = id ? getCollection(id) : null
  if (!c || (c.status !== 'released' && !canViewAdmin(req.user?.role))) {
    res.status(404).json({ message: 'Collection not found' })
    return null
  }
  return c
}

function loadForWrite(req: Request, res: Response) {
  const id = parseId(req.params.id)
  const c = id ? getCollection(id) : null
  if (!c) { res.status(404).json({ message: 'Collection not found' }); return null }
  return c
}

type TextResult = { ok: true; value: string | null | undefined } | { ok: false; message: string }

/** undefined = not supplied; '' after trim is rejected when required. */
function textField(value: unknown, label: string, max: number, required: boolean): TextResult {
  if (value === undefined) return required ? { ok: false, message: `${label} is required` } : { ok: true, value: undefined }
  if (value === null) return required ? { ok: false, message: `${label} is required` } : { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, message: `${label} must be a string` }
  const v = value.trim()
  if (!v) return required ? { ok: false, message: `${label} is required` } : { ok: true, value: null }
  if (v.length > max) return { ok: false, message: `${label} must be ${max} characters or fewer` }
  return { ok: true, value: v }
}

/** Multer errors (too many files, file too large) become a 400 JSON body rather than an HTML 500. */
function uploadFiles(req: Request, res: Response, next: NextFunction) {
  upload.array('files', MAX_FILES_PER_REQUEST)(req, res, (err: unknown) => {
    if (!err) { next(); return }
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? `Each file must be under ${Math.round(MAX_FILE_SIZE / 1_000_000)} MB`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Upload at most ${MAX_FILES_PER_REQUEST} files per request, in the "files" field`
        : err.message
      res.status(400).json({ message })
      return
    }
    next(err)
  })
}

function touch(id: number) {
  db.prepare("UPDATE asset_collections SET updated_at = datetime('now') WHERE id = ?").run(id)
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  res.json(listCollections(canViewAdmin(req.user?.role)))
})

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const c = loadVisible(req, res)
  if (!c) return
  res.json({ ...c, photos: getCollectionPhotos(c.id) })
})

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireAdminWrite, (req, res) => {
  const name = textField(req.body?.name, 'name', NAME_MAX, true)
  const brand = textField(req.body?.brand, 'brand', NAME_MAX, true)
  const description = textField(req.body?.description, 'description', DESCRIPTION_MAX, false)
  if (!name.ok) { res.status(400).json({ message: name.message }); return }
  if (!brand.ok) { res.status(400).json({ message: brand.message }); return }
  if (!description.ok) { res.status(400).json({ message: description.message }); return }
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO asset_collections (name, brand, description, created_by) VALUES (?, ?, ?, ?)'
  ).run(name.value, brand.value, description.value ?? null, req.user!.id)
  res.status(201).json(getCollection(Number(lastInsertRowid)))
})

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, requireAdminWrite, (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  const body = req.body ?? {}

  const sets: string[] = []
  const params: unknown[] = []

  for (const [key, max, required] of [['name', NAME_MAX, true], ['brand', NAME_MAX, true], ['description', DESCRIPTION_MAX, false]] as const) {
    if (body[key] === undefined) continue
    const f = textField(body[key], key, max, required)
    if (!f.ok) { res.status(400).json({ message: f.message }); return }
    sets.push(`${key} = ?`)
    params.push(f.value ?? null)
  }

  if (body.cover_asset_id !== undefined) {
    if (body.cover_asset_id === null) {
      sets.push('cover_asset_id = NULL')
    } else {
      const coverId = Number(body.cover_asset_id)
      const belongs = Number.isInteger(coverId) && db.prepare(
        'SELECT 1 FROM assets WHERE id = ? AND collection_id = ?'
      ).get(coverId, c.id)
      if (!belongs) { res.status(400).json({ message: 'cover_asset_id must be a photo in this collection' }); return }
      sets.push('cover_asset_id = ?')
      params.push(coverId)
    }
  }

  if (sets.length > 0) {
    db.transaction(() => {
      db.prepare(`UPDATE asset_collections SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params, c.id)
      // Photos carry the collection's brand; keep them in step.
      if (typeof body.brand === 'string') {
        db.prepare('UPDATE assets SET brand = ? WHERE collection_id = ?').run(body.brand.trim(), c.id)
      }
    })()
  }
  res.json(getCollection(c.id))
})

// ─── DELETE /:id — the collection AND its photos ──────────────────────────────

router.delete('/:id', requireAuth, requireAdminWrite, async (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  const photos = db.prepare('SELECT id, s3_key FROM assets WHERE collection_id = ?').all(c.id) as { id: number; s3_key: string | null }[]

  // Rows first, in one transaction. ⚠️ Order matters: assets.collection_id is
  // ON DELETE SET NULL, so deleting the collection first would turn every
  // draft photo into a plain, partner-visible Product Library asset.
  db.transaction(() => {
    db.prepare('DELETE FROM assets WHERE collection_id = ?').run(c.id)
    db.prepare('DELETE FROM asset_collections WHERE id = ?').run(c.id)
  })()

  // S3 cleanup is best-effort (deleteS3Object swallows failures), like assets DELETE.
  if (s3Configured()) {
    for (const p of photos) {
      if (!p.s3_key) continue
      await deleteS3Object(p.s3_key)
      await deleteS3Object(thumbKeyFor(p.s3_key))
    }
  }
  res.json({ ok: true, id: c.id, deleted_photos: photos.length })
})

// ─── POST /:id/photos — a few files per request ───────────────────────────────

router.post('/:id/photos', requireAuth, requireAdminWrite, uploadFiles, async (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  if (!s3Configured()) {
    res.status(503).json({ message: 'File storage not configured (missing S3_BUCKET or AWS credentials)' }); return
  }
  const files = (req.files as Express.Multer.File[] | undefined) ?? []
  if (files.length === 0) { res.status(400).json({ message: 'No files uploaded' }); return }

  const bucket = process.env.S3_BUCKET!
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const s3 = getS3Client()
  const result: CollectionUploadResult = { photos: [], errors: [] }
  let rejected = 0

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase()
    const mime = ALLOWED_MIME.has(file.mimetype) ? file.mimetype : IMAGE_MIME[ext]
    if (!mime) {
      rejected++
      result.errors.push({ file: file.originalname, message: 'Not a supported image (use JPEG, PNG, WebP, GIF, TIFF or HEIC)' })
      continue
    }

    // Decode before uploading anything, so an unreadable file leaves no orphan object.
    let thumb: Buffer
    let dimensions: string | null = null
    try {
      const meta = await sharp(file.buffer).metadata()
      if (meta.width && meta.height) {
        const swap = (meta.orientation ?? 1) >= 5 // EXIF 5–8 rotate by 90°
        dimensions = swap ? `${meta.height}x${meta.width}` : `${meta.width}x${meta.height}`
      }
      thumb = await sharp(file.buffer)
        .rotate()
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
    } catch (err) {
      rejected++
      const heic = mime === 'image/heic' || mime === 'image/heif'
      result.errors.push({
        file: file.originalname,
        message: heic
          ? 'This HEIC image could not be processed on the server — export it as JPEG and upload again'
          : 'Could not read this image',
      })
      console.warn('[collections] image decode failed:', file.originalname, (err as Error)?.message)
      continue
    }

    const s3Key = `portal-assets/collections/${c.id}/${randomUUID()}${ext || ''}`
    const thumbKey = thumbKeyFor(s3Key)
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: mime }))
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp' }))
      } catch (err) {
        await deleteS3Object(s3Key)
        throw err
      }
    } catch (err) {
      result.errors.push({ file: file.originalname, message: (err as Error)?.message || 'Upload failed' })
      continue
    }

    // sort_order computed in the INSERT itself, so parallel requests never collide on a read-then-write.
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, dimensions, s3_key, collection_id, sort_order)
      VALUES (?, ?, 'Photo', ?, ?, ?, ?, ?, ?,
              (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM assets WHERE collection_id = ?))
    `).run(
      nameFromFilename(file.originalname), c.brand,
      buildS3Url(bucket, region, s3Key), buildS3Url(bucket, region, thumbKey),
      formatFileSize(file.size), dimensions, s3Key, c.id, c.id,
    )
    result.photos.push(getPhoto(Number(lastInsertRowid)) as CollectionPhoto)
  }

  if (result.photos.length > 0) touch(c.id)
  const status = result.photos.length > 0 ? 201 : rejected === files.length ? 400 : 500
  res.status(status).json(result)
})

// ─── PUT /:id/order ───────────────────────────────────────────────────────────

router.put('/:id/order', requireAuth, requireAdminWrite, (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  const ids = req.body?.photo_ids
  if (!Array.isArray(ids) || !ids.every(n => Number.isInteger(n))) {
    res.status(400).json({ message: 'photo_ids must be an array of photo ids' }); return
  }
  if (new Set(ids).size !== ids.length) { res.status(400).json({ message: 'photo_ids contains duplicates' }); return }

  const current = getCollectionPhotos(c.id).map(p => p.id)
  const inCollection = new Set(current)
  const foreign = (ids as number[]).filter(id => !inCollection.has(id))
  if (foreign.length > 0) {
    res.status(400).json({ message: `Not photos of this collection: ${foreign.join(', ')}` }); return
  }

  // Listed photos first, in the given order; any not listed keep their relative order after them.
  const listed = new Set(ids as number[])
  const final = [...(ids as number[]), ...current.filter(id => !listed.has(id))]
  const stmt = db.prepare('UPDATE assets SET sort_order = ? WHERE id = ? AND collection_id = ?')
  db.transaction(() => { final.forEach((id, i) => stmt.run(i, id, c.id)) })()
  touch(c.id)
  res.json(getCollectionDetail(c.id))
})

// ─── PUT /:id/schedule ────────────────────────────────────────────────────────

router.put('/:id/schedule', requireAuth, requireAdminWrite, (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  if (!req.body || !('release_at' in req.body)) {
    res.status(400).json({ message: 'release_at is required (a future time, or null to unschedule)' }); return
  }
  if (c.status === 'released') {
    res.status(400).json({ message: 'This collection is already released — unrelease it first to schedule it' }); return
  }

  const raw = req.body.release_at
  if (raw === null || raw === '') {
    db.prepare(
      "UPDATE asset_collections SET status = 'draft', release_at = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(c.id)
    res.json(getCollection(c.id)); return
  }

  const at = normalizeTs(raw)
  if (!at) { res.status(400).json({ message: 'release_at is not a valid date/time' }); return }
  if (at <= (normalizeTs(new Date()) as string)) {
    res.status(400).json({ message: 'release_at must be in the future' }); return
  }
  if (photoCount(c.id) === 0) {
    res.status(400).json({ message: 'Add at least one photo before scheduling a release' }); return
  }
  db.prepare(
    "UPDATE asset_collections SET status = 'scheduled', release_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(at, c.id)
  res.json(getCollection(c.id))
})

// ─── POST /:id/release — release now ──────────────────────────────────────────

router.post('/:id/release', requireAuth, requireAdminWrite, (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  if (c.status === 'released') {
    res.json({ ...c, notified: false, message: 'Already released — nothing changed' }); return
  }
  if (c.photo_count === 0) { res.status(400).json({ message: 'Add at least one photo before releasing' }); return }
  const { notified } = releaseCollection(c.id)
  res.json({
    ...getCollection(c.id),
    notified,
    message: notified
      ? 'Released — partners have been notified'
      : 'Released — partners were already notified when this collection was first released, so no new notification was sent',
  })
})

// ─── POST /:id/unrelease — back to draft ──────────────────────────────────────

router.post('/:id/unrelease', requireAuth, requireAdminWrite, (req, res) => {
  const c = loadForWrite(req, res)
  if (!c) return
  // notified_at is deliberately kept: a later re-release must not notify again.
  db.prepare(
    "UPDATE asset_collections SET status = 'draft', release_at = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(c.id)
  const wasNotified = !!(db.prepare('SELECT notified_at FROM asset_collections WHERE id = ?').get(c.id) as { notified_at: string | null }).notified_at
  res.json({
    ...getCollection(c.id),
    message: wasNotified
      ? 'Hidden from partners. Partners were already notified, so releasing it again will not send another notification.'
      : 'Hidden from partners.',
  })
})

export default router
