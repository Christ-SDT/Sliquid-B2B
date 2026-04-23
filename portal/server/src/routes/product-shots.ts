import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
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

// ─── GET / — list all product shots ──────────────────────────────────────────

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM product_shots ORDER BY created_at DESC').all()
  const totalRow = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM product_shots').get() as { total: number }
  res.json({ shots: rows, totalBytes: totalRow.total })
})

// ─── POST /upload — upload one product shot ───────────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']
  if (!allowedMimes.includes(file.mimetype)) {
    res.status(400).json({ message: 'Only image files are accepted (jpeg, png, webp, gif, tiff)' }); return
  }

  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `product-shots/${randomUUID()}${ext}`
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
      INSERT INTO product_shots (filename, label, s3_key, file_url, file_size, size_bytes, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(file.originalname, label, s3Key, fileUrl, fileSize, file.size, file.mimetype, (req as any).user!.name)

    const row = db.prepare('SELECT * FROM product_shots WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(row)
  } catch (err: any) {
    console.error('[product-shots] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── POST /bulk-upload — upload multiple product shots ────────────────────────

router.post('/bulk-upload', requireAuth, requireRole('tier5', 'admin'), upload.array('files'), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? []
  if (files.length === 0) { res.status(400).json({ message: 'No files uploaded' }); return }

  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const bucket = process.env.S3_BUCKET!
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const items: Record<string, unknown>[] = []
  const errors: string[] = []

  for (const file of files) {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']
    if (!allowedMimes.includes(file.mimetype)) {
      errors.push(`${file.originalname}: unsupported file type`)
      continue
    }
    try {
      const ext = path.extname(file.originalname).toLowerCase()
      const s3Key = `product-shots/${randomUUID()}${ext}`
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
        INSERT INTO product_shots (filename, label, s3_key, file_url, file_size, size_bytes, mime_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(file.originalname, label, s3Key, fileUrl, fileSize, file.size, file.mimetype, (req as any).user!.name)

      items.push(db.prepare('SELECT * FROM product_shots WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>)
    } catch (err: any) {
      errors.push(`${file.originalname}: ${err.message ?? 'upload failed'}`)
    }
  }

  res.status(items.length > 0 ? 201 : 500).json({ items, count: items.length, ...(errors.length > 0 && { errors }) })
})

// ─── GET /:id/download — proxy S3 file to avoid browser CORS ─────────────────

router.get('/:id/download', requireAuth, async (req, res) => {
  const row = db.prepare('SELECT * FROM product_shots WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }

  try {
    const s3 = getS3Client()
    const response = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: row.s3_key }))
    res.setHeader('Content-Type', row.mime_type ?? 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`)
    if (response.ContentLength) res.setHeader('Content-Length', String(response.ContentLength))
    ;(response.Body as Readable).pipe(res)
  } catch (err: any) {
    console.error('[product-shots] download error:', err)
    res.status(500).json({ message: err.message ?? 'Download failed' })
  }
})

// ─── PUT /:id — rename label ──────────────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label } = req.body
  if (!label || typeof label !== 'string' || !label.trim()) {
    res.status(400).json({ message: 'label is required' }); return
  }
  const result = db.prepare('UPDATE product_shots SET label = ? WHERE id = ?').run(label.trim(), req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare('SELECT * FROM product_shots WHERE id = ?').get(req.params.id))
})

// ─── DELETE /:id — delete one ─────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT * FROM product_shots WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM product_shots WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ─── POST /bulk-delete — delete many ─────────────────────────────────────────

router.post('/bulk-delete', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const { ids } = req.body as { ids?: number[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: 'ids array is required' }); return
  }

  const rows = ids
    .map(id => db.prepare('SELECT * FROM product_shots WHERE id = ?').get(id) as any)
    .filter(Boolean)

  for (const row of rows) {
    if (row.s3_key) await deleteS3Object(row.s3_key)
  }

  db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM product_shots WHERE id = ?').run(id)
    }
  })()

  res.json({ ok: true, deleted: rows.length })
})

export default router
