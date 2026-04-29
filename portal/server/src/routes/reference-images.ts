import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

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

// ─── GET / — list all reference images ───────────────────────────────────────

router.get('/', requireAuth, (_req, res) => {
  const images = db.prepare(`
    SELECT * FROM reference_images ORDER BY created_at DESC
  `).all()
  const totalRow = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM reference_images').get() as { total: number }
  res.json({ images, totalBytes: totalRow.total })
})

// ─── POST /upload — upload one reference image ────────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedMimes.includes(file.mimetype)) {
    res.status(400).json({ message: 'Only image files are accepted (jpeg, png, webp, gif)' }); return
  }

  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `reference-images/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)
    const baseName = file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
    const label = baseName.charAt(0).toUpperCase() + baseName.slice(1)
    const fileSize = file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

    const result = db.prepare(`
      INSERT INTO reference_images (filename, label, s3_key, file_url, file_size, size_bytes, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.originalname, label, s3Key, fileUrl, fileSize, file.size, file.mimetype,
      (req as any).user!.name,
    )

    const row = db.prepare('SELECT * FROM reference_images WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(row)
  } catch (err: any) {
    console.error('[reference-images] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── PUT /:id — rename label ──────────────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label } = req.body
  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ message: 'label is required' }); return
  }
  const result = db.prepare('UPDATE reference_images SET label = ? WHERE id = ?').run(label.trim(), req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM reference_images WHERE id = ?').get(req.params.id)
  res.json(row)
})

// ─── DELETE /:id — delete one ────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT * FROM reference_images WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM reference_images WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ─── POST /bulk-delete — delete many ─────────────────────────────────────────

router.post('/bulk-delete', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const { ids } = req.body as { ids?: number[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: 'ids array is required' }); return
  }

  const rows = ids.map(id =>
    db.prepare('SELECT * FROM reference_images WHERE id = ?').get(id) as any
  ).filter(Boolean)

  for (const row of rows) {
    if (row.s3_key) await deleteS3Object(row.s3_key)
  }

  db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM reference_images WHERE id = ?').run(id)
    }
  })()

  res.json({ ok: true, deleted: rows.length })
})

export default router
