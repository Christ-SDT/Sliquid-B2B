import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50_000_000 } })

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

// ─── GET / — aggregated gallery from all sources ─────────────────────────────

router.get('/', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  const assets = db.prepare(`
    SELECT id, 'asset' as _source, name as label, brand, type,
           file_url, thumbnail_url, file_size, dimensions, s3_key, created_at
    FROM assets WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const creatives = db.prepare(`
    SELECT id, 'creative' as _source, title as label, brand, type,
           file_url, thumbnail_url, file_size, dimensions, s3_key, created_at
    FROM creatives WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const marketing = db.prepare(`
    SELECT id, 'marketing' as _source, name as label, 'Sliquid' as brand, NULL as type,
           image_url as file_url, image_url as thumbnail_url,
           NULL as file_size, NULL as dimensions, s3_key, created_at
    FROM marketing_items WHERE s3_key IS NOT NULL
  `).all() as Record<string, unknown>[]

  const ai = db.prepare(`
    SELECT id, 'ai' as _source, prompt as label, 'Creator Creations' as brand, NULL as type,
           s3_url as file_url, s3_url as thumbnail_url,
           NULL as file_size, NULL as dimensions, s3_key, created_at
    FROM ai_images
  `).all() as Record<string, unknown>[]

  const media = db.prepare(`
    SELECT id, 'media' as _source, label, brand, NULL as type,
           file_url, file_url as thumbnail_url, file_size, dimensions,
           s3_key, mime_type, uploaded_by, created_at
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

  const { label, brand } = req.body

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/media/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)

    // Detect dimensions for images server-side (store null; client can display from img)
    const fileSize = `${(file.size / 1024).toFixed(0)} KB`

    const result = db.prepare(`
      INSERT INTO media (filename, label, brand, s3_key, file_url, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.originalname,
      label || file.originalname.replace(/\.[^.]+$/, ''),
      brand || 'Sliquid',
      s3Key,
      fileUrl,
      fileSize,
      file.mimetype,
      (req as any).user!.name,
    )

    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    res.status(201).json({ ...row, _source: 'media', thumbnail_url: row.file_url })
  } catch (err: any) {
    console.error('[media] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── PUT /:id — update label and brand for media table rows ──────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, brand } = req.body
  const result = db.prepare(
    'UPDATE media SET label = ?, brand = ? WHERE id = ?'
  ).run(label ?? null, brand ?? 'Sliquid', req.params.id)

  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any
  res.json({ ...row, _source: 'media', thumbnail_url: row.file_url })
})

// ─── DELETE /:id — delete media table row + S3 object ────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
