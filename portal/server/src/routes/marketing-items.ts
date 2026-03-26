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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseItem(row: Record<string, unknown>) {
  return {
    ...row,
    specs: JSON.parse((row.specs as string) || '[]'),
    variants: JSON.parse((row.variants as string) || '[]'),
  }
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM marketing_items ORDER BY sort_order, id').all() as Record<string, unknown>[]
  res.json(rows.map(parseItem))
})

// ─── POST /upload — new item via S3 file upload ───────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  const { name, subtitle, description, specs, variants, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }
  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/marketing-items/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))
    const imageUrl = buildS3Url(bucket, region, s3Key)
    const result = db.prepare(
      'INSERT INTO marketing_items (name, subtitle, description, specs, variants, image_url, icon_name, sort_order, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name, subtitle ?? null, description ?? null,
      JSON.stringify(Array.isArray(specs) ? specs : (specs ? JSON.parse(specs) : [])),
      JSON.stringify(Array.isArray(variants) ? variants : (variants ? JSON.parse(variants) : [])),
      imageUrl, icon_name ?? 'Package', sort_order ?? 0, s3Key,
    )
    const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    res.status(201).json(parseItem(row))
  } catch (err: any) {
    console.error('[marketing-items] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── PUT /:id/image — replace image for existing item ─────────────────────────

router.put('/:id/image', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }
  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/marketing-items/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))
    const imageUrl = buildS3Url(bucket, region, s3Key)
    if (row.s3_key) await deleteS3Object(row.s3_key)
    db.prepare('UPDATE marketing_items SET image_url=?, s3_key=? WHERE id=?').run(imageUrl, s3Key, id)
    const updated = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(id) as Record<string, unknown>
    res.json(parseItem(updated))
  } catch (err: any) {
    console.error('[marketing-items] image replace error:', err)
    res.status(500).json({ message: err.message ?? 'Image replace failed' })
  }
})

// ─── POST / — JSON create ─────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'INSERT INTO marketing_items (name, subtitle, description, specs, variants, image_url, icon_name, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null, icon_name ?? 'Package', sort_order ?? 0,
  )
  const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  res.status(201).json(parseItem(row))
})

// ─── PUT /:id — JSON metadata update ─────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'UPDATE marketing_items SET name=?, subtitle=?, description=?, specs=?, variants=?, image_url=?, icon_name=?, sort_order=? WHERE id=?'
  ).run(
    name, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null, icon_name ?? 'Package', sort_order ?? 0, req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseItem(row))
})

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT s3_key FROM marketing_items WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM marketing_items WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
