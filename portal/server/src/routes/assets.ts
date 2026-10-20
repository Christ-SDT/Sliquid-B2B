import { Router } from 'express'
import multer from 'multer'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notifyUsers } from '../notifications.js'
import { sendBroadcastEmail } from '../email.js'
import { canViewAdmin } from '../roles.js'
import { thumbKeyFor } from '../collections.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 750_000_000 } })

// ─── S3 helpers ───────────────────────────────────────────────────────────────

export function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

export function buildS3Url(bucket: string, region: string, key: string) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

export async function deleteS3Object(key: string) {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }))
  } catch { /* continue even if S3 delete fails */ }
}

/** Same check every upload route uses before touching S3. */
export function s3Configured(): boolean {
  return !!(process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID)
}

/** "12.3 KB" / "4.5 MB" — the human string stored in assets.file_size. */
export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "launch_hero-shot.jpg" → "Launch hero shot". */
export function nameFromFilename(filename: string): string {
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
  return baseName.charAt(0).toUpperCase() + baseName.slice(1)
}

/**
 * Collection photos (assets.collection_id IS NOT NULL) are served ONLY through
 * /api/collections, which applies the draft/scheduled/released gate. Every
 * plain read below carries this predicate — dropping it leaks unreleased
 * launch photos into every partner's brand sections.
 */
const NOT_IN_COLLECTION = 'collection_id IS NULL'

/** Wall-clock cap on the download fetch's connection + headers. */
const DOWNLOAD_TIMEOUT_MS = 30_000

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const { brand, type, search } = req.query
  let sql = `SELECT * FROM assets WHERE ${NOT_IN_COLLECTION}`
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`) }
  sql += ' ORDER BY featured DESC, brand, name'
  res.json(db.prepare(sql).all(...params))
})

// ─── GET /:id/download — stream the original as an attachment ────────────────
//
// ⚠️ The source URL is built ONLY from env S3_BUCKET + AWS_REGION + the row's
// s3_key — never from the DB file_url, which would make this an SSRF sink (see
// GET /api/media/proxy-download). Public HTTPS rather than a signed GetObject,
// because the server's IAM principal can PutObject but not GetObject (see
// src/mcp/bytes.ts). `redirect: 'error'` keeps the fetch on that one host.

router.get('/:id/download', requireAuth, async (req, res) => {
  const row = db.prepare(`
    SELECT a.name, a.s3_key, a.collection_id, c.status AS collection_status
    FROM assets a LEFT JOIN asset_collections c ON c.id = a.collection_id
    WHERE a.id = ?
  `).get(req.params.id) as
    | { name: string; s3_key: string | null; collection_id: number | null; collection_status: string | null }
    | undefined
  // An unreleased collection photo is indistinguishable from a missing one for partners.
  const visible = !!row && (row.collection_id === null || row.collection_status === 'released' || canViewAdmin(req.user?.role))
  if (!row || !visible || !row.s3_key) { res.status(404).json({ message: 'Not found' }); return }

  const bucket = process.env.S3_BUCKET
  if (!bucket) { res.status(503).json({ message: 'File storage not configured' }); return }
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const encodedKey = row.s3_key.split('/').map(encodeURIComponent).join('/')
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`

  let upstream: globalThis.Response
  try {
    upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  } catch (err) {
    console.error('[assets] download fetch failed:', (err as Error)?.message)
    res.status(502).json({ message: 'Failed to fetch file' }); return
  }
  if (!upstream.ok || !upstream.body) {
    res.status(upstream.status === 404 ? 404 : 502).json({ message: 'Failed to fetch file' }); return
  }

  const ext = path.extname(row.s3_key)
  const rawName = !ext || row.name.toLowerCase().endsWith(ext.toLowerCase()) ? row.name : `${row.name}${ext}`
  const asciiName = (rawName
    .replace(/[\r\n"\\]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()) || 'download'
  const encodedName = encodeURIComponent(rawName).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`)
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
  const length = upstream.headers.get('content-length')
  if (length) res.setHeader('Content-Length', length)

  try {
    await pipeline(Readable.fromWeb(upstream.body as any), res)
  } catch (err) {
    console.error('[assets] download stream failed:', (err as Error)?.message)
    if (!res.headersSent) res.status(502).json({ message: 'Download failed' })
    else res.destroy()
  }
})

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const asset = db.prepare(`SELECT * FROM assets WHERE id = ? AND ${NOT_IN_COLLECTION}`).get(req.params.id)
  if (!asset) { res.status(404).json({ message: 'Not found' }); return }
  res.json(asset)
})

// ─── POST /upload — new asset via S3 file upload ─────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'),
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  async (req, res) => {
  const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined
  const file = filesMap?.file?.[0]
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

  const { name, brand, type, thumbnail_url, file_size, dimensions } = req.body
  if (!name || !brand || !type) {
    res.status(400).json({ message: 'Missing required fields: name, brand, type' }); return
  }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured (missing S3_BUCKET or AWS credentials)' }); return
  }

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/assets/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)

    // Thumbnail: uploaded thumbnail file > thumbnail_url text > image auto-thumb > null
    const thumbFile = filesMap?.thumbnail?.[0]
    let thumbUrl: string | null = null
    if (thumbFile) {
      const thumbExt = path.extname(thumbFile.originalname || 'thumb.jpg').toLowerCase() || '.jpg'
      const thumbKey = `portal-assets/assets/${randomUUID()}-thumb${thumbExt}`
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket, Key: thumbKey, Body: thumbFile.buffer, ContentType: thumbFile.mimetype,
      }))
      thumbUrl = buildS3Url(bucket, region, thumbKey)
    } else {
      thumbUrl = thumbnail_url ?? (file.mimetype.startsWith('image/') ? fileUrl : null)
    }
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, dimensions, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, brand, type, fileUrl, thumbUrl, file_size ?? null, dimensions ?? null, s3Key)

    if (req.body.notify === 'true') {
      notifyUsers('new_asset', 'New in Product Library', `${name} (${brand}) has been added to the Product Library.`, '/assets', { key: 'productLibraryItem', params: { name: name, brand } })
      sendBroadcastEmail({ assetName: name, brand })
        .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
    }
    res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(lastInsertRowid))
  } catch (err: any) {
    console.error('[assets] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── POST /bulk-upload — upload multiple assets at once ──────────────────────

router.post('/bulk-upload', requireAuth, requireRole('tier5', 'admin'), upload.any(), async (req, res) => {
  const allFiles = (req.files as Express.Multer.File[]) ?? []
  const files = allFiles.filter(f => f.fieldname === 'files')
  const thumbMap = new Map<number, Express.Multer.File>()
  for (const f of allFiles) {
    const m = f.fieldname.match(/^thumbnail_(\d+)$/)
    if (m) thumbMap.set(parseInt(m[1]), f)
  }
  if (files.length === 0) { res.status(400).json({ message: 'No files uploaded' }); return }

  const { brand, type, notify } = req.body
  if (!brand || !type) { res.status(400).json({ message: 'brand and type are required' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const bucket = process.env.S3_BUCKET!
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const items: Record<string, unknown>[] = []
  const errors: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const ext = path.extname(file.originalname).toLowerCase()
      const s3Key = `portal-assets/assets/${randomUUID()}${ext}`
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
      }))
      const fileUrl = buildS3Url(bucket, region, s3Key)

      // Thumbnail: uploaded thumbnail > image auto-thumb > null
      let thumbUrl: string | null = null
      if (file.mimetype.startsWith('image/')) {
        thumbUrl = fileUrl
      } else if (thumbMap.has(i)) {
        const tf = thumbMap.get(i)!
        const thumbExt = path.extname(tf.originalname || 'thumb.jpg').toLowerCase() || '.jpg'
        const thumbKey = `portal-assets/assets/${randomUUID()}-thumb${thumbExt}`
        await getS3Client().send(new PutObjectCommand({
          Bucket: bucket, Key: thumbKey, Body: tf.buffer, ContentType: tf.mimetype,
        }))
        thumbUrl = buildS3Url(bucket, region, thumbKey)
      }
      const name = nameFromFilename(file.originalname)
      const fileSize = formatFileSize(file.size)

      const { lastInsertRowid } = db.prepare(
        'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(name, brand, type, fileUrl, thumbUrl, fileSize, s3Key)

      items.push(db.prepare('SELECT * FROM assets WHERE id = ?').get(lastInsertRowid) as Record<string, unknown>)
    } catch (err: any) {
      errors.push(`${file.originalname}: ${err.message ?? 'upload failed'}`)
    }
  }

  if (notify === 'true' && items.length > 0) {
    notifyUsers('new_asset', 'New in Product Library', `${items.length} new file${items.length > 1 ? 's' : ''} (${brand}) added to the Product Library.`, '/assets', { key: 'productLibraryBulk', params: { count: items.length, brand } })
    sendBroadcastEmail({ assetName: `${items.length} new file${items.length > 1 ? 's' : ''}`, brand })
      .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
  }

  res.status(items.length > 0 ? 201 : 500).json({ items, count: items.length, ...(errors.length > 0 && { errors }) })
})

// ─── PUT /:id/file — replace file for existing asset ─────────────────────────

router.put('/:id/file', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.collection_id !== null) {
    // Its webp thumbnail would go stale; collection photos are replaced by delete + re-upload.
    res.status(400).json({ message: 'Collection photos cannot be replaced here — delete it and upload again to the collection' }); return
  }

  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const { name, brand, type, thumbnail_url, file_size, dimensions } = req.body

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/assets/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)
    const thumbUrl = thumbnail_url ?? (file.mimetype.startsWith('image/') ? fileUrl : row.thumbnail_url)

    // Delete old S3 object if this asset previously had one
    if (row.s3_key) await deleteS3Object(row.s3_key)

    db.prepare(
      'UPDATE assets SET name=?, brand=?, type=?, file_url=?, thumbnail_url=?, file_size=?, dimensions=?, s3_key=? WHERE id=?'
    ).run(
      name ?? row.name, brand ?? row.brand, type ?? row.type,
      fileUrl, thumbUrl, file_size ?? null, dimensions ?? null, s3Key, id
    )

    res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(id))
  } catch (err: any) {
    console.error('[assets] file replace error:', err)
    res.status(500).json({ message: err.message ?? 'File replace failed' })
  }
})

// ─── PUT /:id — JSON metadata update ─────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, brand, type, file_url, thumbnail_url, file_size, dimensions, featured } = req.body
  if (!name || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' }); return
  }
  const result = db.prepare(
    'UPDATE assets SET name=?, brand=?, type=?, file_url=?, thumbnail_url=?, file_size=?, dimensions=?, featured=? WHERE id=?'
  ).run(name, brand, type, file_url, thumbnail_url ?? null, file_size ?? null, dimensions ?? null, featured ?? 0, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id))
})

// ─── POST / — JSON create ─────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, brand, type, file_url, thumbnail_url, file_size, dimensions } = req.body
  if (!name || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }
  const result = db.prepare(
    'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, dimensions) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, brand, type, file_url, thumbnail_url ?? null, file_size ?? null, dimensions ?? null)
  notifyUsers('new_asset', 'New in Product Library', `${name} (${brand}) has been added to the Product Library.`, '/assets', { key: 'productLibraryItem', params: { name: name, brand } })
  res.status(201).json({ id: result.lastInsertRowid })
})

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT s3_key, collection_id FROM assets WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  // A collection photo's webp thumbnail lives beside the original (derivable key).
  if (row.s3_key && row.collection_id !== null) await deleteS3Object(thumbKeyFor(row.s3_key))
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id)
  if (row.collection_id !== null) {
    db.prepare("UPDATE asset_collections SET updated_at = datetime('now') WHERE id = ?").run(row.collection_id)
  }
  res.json({ ok: true })
})

// ─── PUT /:id/featured — toggle star ─────────────────────────────────────────

router.put('/:id/featured', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = parseInt(req.params.id)
  const row = db.prepare('SELECT featured FROM assets WHERE id = ?').get(id) as { featured: number } | undefined
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  const newValue = row.featured ? 0 : 1
  db.prepare('UPDATE assets SET featured = ? WHERE id = ?').run(newValue, id)
  res.json({ id, featured: newValue })
})

export default router
