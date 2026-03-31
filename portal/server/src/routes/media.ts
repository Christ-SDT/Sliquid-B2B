import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notifyUsers } from '../notifications.js'
import { sendBroadcastEmail } from '../email.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 750_000_000 } })

// ─── S3 helpers ───────────────────────────────────────────────────────────────

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

function buildS3Url(bucket: string, region: string, key: string) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

async function deleteS3Object(key: string) {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }))
  } catch { /* continue even if S3 delete fails */ }
}

// Valid source values
type Source = 'asset' | 'creative' | 'marketing' | 'ai' | 'media'
const VALID_SOURCES: Source[] = ['asset', 'creative', 'marketing', 'ai', 'media']

// ─── GET / — aggregated gallery from all sources ─────────────────────────────

router.get('/', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  const assets = db.prepare(`
    SELECT id, 'asset' as _source, name as label, brand, type,
           file_url, thumbnail_url, file_size, dimensions, s3_key, NULL as description,
           NULL as subtitle, NULL as campaign, NULL as mime_type, NULL as uploaded_by, created_at
    FROM assets WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const creatives = db.prepare(`
    SELECT id, 'creative' as _source, title as label, brand, type,
           file_url, thumbnail_url, file_size, dimensions, s3_key, description,
           NULL as subtitle, campaign, NULL as mime_type, NULL as uploaded_by, created_at
    FROM creatives WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const marketing = db.prepare(`
    SELECT id, 'marketing' as _source, name as label, 'Sliquid' as brand, NULL as type,
           image_url as file_url, image_url as thumbnail_url,
           NULL as file_size, NULL as dimensions, s3_key, description,
           subtitle, NULL as campaign, NULL as mime_type, NULL as uploaded_by, created_at
    FROM marketing_items WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const ai = db.prepare(`
    SELECT id, 'ai' as _source, prompt as label, 'Creator Creations' as brand, NULL as type,
           s3_url as file_url, s3_url as thumbnail_url,
           NULL as file_size, NULL as dimensions, s3_key, NULL as description,
           NULL as subtitle, NULL as campaign, NULL as mime_type, created_by as uploaded_by, created_at
    FROM ai_images
  `).all() as Record<string, unknown>[]

  const media = db.prepare(`
    SELECT id, 'media' as _source, label, brand, NULL as type,
           file_url, file_url as thumbnail_url, file_size, dimensions,
           s3_key, NULL as description, NULL as subtitle, NULL as campaign,
           mime_type, uploaded_by, created_at
    FROM media
  `).all() as Record<string, unknown>[]

  const all = [...assets, ...creatives, ...marketing, ...ai, ...media]
  all.sort((a, b) => {
    const da = (a.created_at as string) ?? ''
    const db2 = (b.created_at as string) ?? ''
    return da < db2 ? 1 : da > db2 ? -1 : 0
  })

  res.json(all)
})

// ─── POST /upload — upload standalone media to S3 ────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const { label, brand, notify } = req.body

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/media/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)
    const fileSize = `${(file.size / 1024).toFixed(0)} KB`

    const result = db.prepare(`
      INSERT INTO media (filename, label, brand, s3_key, file_url, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.originalname,
      label || file.originalname.replace(/\.[^.]+$/, ''),
      brand || 'Sliquid',
      s3Key, fileUrl, fileSize, file.mimetype,
      (req as any).user!.name,
    )

    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>

    if (notify === 'true') {
      const name = (row.label as string) ?? file.originalname
      notifyUsers('new_asset', 'New Media Added', `${name} has been added to the Media Library.`, '/media')
      sendBroadcastEmail({ assetName: name, brand: '' })
        .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
    }

    res.status(201).json({ ...row, _source: 'media', thumbnail_url: row.file_url })
  } catch (err: any) {
    console.error('[media] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── POST /bulk-upload — upload multiple media files at once ─────────────────

router.post('/bulk-upload', requireAuth, requireRole('tier5', 'admin'), upload.array('files', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined
  if (!files || files.length === 0) { res.status(400).json({ message: 'No files uploaded' }); return }

  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const { brand, notify } = req.body
  const resolvedBrand = brand || 'Sliquid'
  const bucket = process.env.S3_BUCKET!
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const items: Record<string, unknown>[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      const ext = path.extname(file.originalname).toLowerCase()
      const s3Key = `portal-assets/media/${randomUUID()}${ext}`
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
      }))
      const fileUrl = buildS3Url(bucket, region, s3Key)
      const baseName = file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
      const label = baseName.charAt(0).toUpperCase() + baseName.slice(1)
      const fileSize = file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

      const { lastInsertRowid } = db.prepare(
        'INSERT INTO media (filename, label, brand, s3_key, file_url, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(file.originalname, label, resolvedBrand, s3Key, fileUrl, fileSize, file.mimetype, (req as any).user!.name)

      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(lastInsertRowid) as Record<string, unknown>
      items.push({ ...row, _source: 'media', thumbnail_url: row.file_url })
    } catch (err: any) {
      errors.push(`${file.originalname}: ${err.message ?? 'upload failed'}`)
    }
  }

  if (notify === 'true' && items.length > 0) {
    notifyUsers('new_asset', 'New Media Added', `${items.length} new file${items.length > 1 ? 's' : ''} added to the Media Library.`, '/media')
    sendBroadcastEmail({ assetName: `${items.length} new file${items.length > 1 ? 's' : ''}`, brand: resolvedBrand })
      .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
  }

  res.status(items.length > 0 ? 201 : 500).json({ items, count: items.length, ...(errors.length > 0 && { errors }) })
})

// ─── PUT /item/:source/:id — unified update for any source ───────────────────
// Supported fields per source:
//   asset:     name, brand, type, file_url, thumbnail_url, file_size, dimensions
//   creative:  label(title), brand, type, file_url, thumbnail_url, description, campaign, file_size, dimensions
//   marketing: name, subtitle, description
//   ai:        (no editable fields — deletion only)
//   media:     label, brand

router.put('/item/:source/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const source = req.params.source as Source
  const id = req.params.id

  if (!VALID_SOURCES.includes(source)) {
    res.status(400).json({ message: `Unknown source: ${source}` }); return
  }

  const b = req.body

  try {
    if (source === 'asset') {
      if (!b.name || !b.brand || !b.type || !b.file_url) {
        res.status(400).json({ message: 'name, brand, type, and file_url are required' }); return
      }
      const result = db.prepare(
        'UPDATE assets SET name=?, brand=?, type=?, file_url=?, thumbnail_url=?, file_size=?, dimensions=? WHERE id=?'
      ).run(b.name, b.brand, b.type, b.file_url, b.thumbnail_url ?? null, b.file_size ?? null, b.dimensions ?? null, id)
      if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
      const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any
      return res.json({ ...row, _source: 'asset', label: row.name, thumbnail_url: row.thumbnail_url ?? row.file_url })
    }

    if (source === 'creative') {
      if (!b.name || !b.brand || !b.type || !b.file_url) {
        res.status(400).json({ message: 'name, brand, type, and file_url are required' }); return
      }
      const result = db.prepare(
        'UPDATE creatives SET title=?, brand=?, type=?, file_url=?, thumbnail_url=?, description=?, campaign=?, file_size=?, dimensions=? WHERE id=?'
      ).run(b.name, b.brand, b.type, b.file_url, b.thumbnail_url ?? null, b.description ?? null, b.campaign ?? null, b.file_size ?? null, b.dimensions ?? null, id)
      if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
      const row = db.prepare('SELECT * FROM creatives WHERE id = ?').get(id) as any
      return res.json({ ...row, _source: 'creative', label: row.title, thumbnail_url: row.thumbnail_url ?? row.file_url })
    }

    if (source === 'marketing') {
      if (!b.name) {
        res.status(400).json({ message: 'name is required' }); return
      }
      const existing = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(id) as any
      if (!existing) { res.status(404).json({ message: 'Not found' }); return }
      db.prepare(
        'UPDATE marketing_items SET name=?, subtitle=?, description=? WHERE id=?'
      ).run(b.name, b.subtitle ?? existing.subtitle, b.description ?? existing.description, id)
      const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(id) as any
      return res.json({ ...row, _source: 'marketing', label: row.name, file_url: row.image_url, thumbnail_url: row.image_url })
    }

    if (source === 'ai') {
      res.status(400).json({ message: 'AI-generated images cannot be edited' }); return
    }

    if (source === 'media') {
      const result = db.prepare(
        'UPDATE media SET label=?, brand=? WHERE id=?'
      ).run(b.label ?? null, b.brand ?? 'Sliquid', id)
      if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
      return res.json({ ...row, _source: 'media', thumbnail_url: row.file_url })
    }
  } catch (err: any) {
    console.error('[media] update error:', err)
    res.status(500).json({ message: err.message ?? 'Update failed' })
  }
})

// ─── DELETE /item/:source/:id — unified delete for any source ────────────────

router.delete('/item/:source/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const source = req.params.source as Source
  const id = req.params.id

  if (!VALID_SOURCES.includes(source)) {
    res.status(400).json({ message: `Unknown source: ${source}` }); return
  }

  try {
    if (source === 'asset') {
      const row = db.prepare('SELECT s3_key FROM assets WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      db.prepare('DELETE FROM assets WHERE id = ?').run(id)
      return res.json({ ok: true })
    }

    if (source === 'creative') {
      const row = db.prepare('SELECT s3_key FROM creatives WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      db.prepare('DELETE FROM creatives WHERE id = ?').run(id)
      return res.json({ ok: true })
    }

    if (source === 'marketing') {
      const row = db.prepare('SELECT s3_key FROM marketing_items WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      db.prepare('DELETE FROM marketing_items WHERE id = ?').run(id)
      return res.json({ ok: true })
    }

    if (source === 'ai') {
      const row = db.prepare('SELECT s3_key FROM ai_images WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      db.prepare('DELETE FROM ai_images WHERE id = ?').run(id)
      return res.json({ ok: true })
    }

    if (source === 'media') {
      const row = db.prepare('SELECT s3_key FROM media WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      db.prepare('DELETE FROM media WHERE id = ?').run(id)
      return res.json({ ok: true })
    }
  } catch (err: any) {
    console.error('[media] delete error:', err)
    res.status(500).json({ message: err.message ?? 'Delete failed' })
  }
})

// ─── PUT /:id — legacy update for media table rows (kept for backward compat) ─

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, brand } = req.body
  const result = db.prepare(
    'UPDATE media SET label = ?, brand = ? WHERE id = ?'
  ).run(label ?? null, brand ?? 'Sliquid', req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any
  res.json({ ...row, _source: 'media', thumbnail_url: row.file_url })
})

// ─── DELETE /:id — legacy delete for media table rows (kept for backward compat) ─

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
