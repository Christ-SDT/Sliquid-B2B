import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notifyUsers } from '../notifications.js'

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

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const { brand, type, search } = req.query
  let sql = 'SELECT * FROM assets WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`) }
  sql += ' ORDER BY brand, name'
  res.json(db.prepare(sql).all(...params))
})

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id)
  if (!asset) { res.status(404).json({ message: 'Not found' }); return }
  res.json(asset)
})

// ─── POST /upload — new asset via S3 file upload ─────────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
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
    // Auto-use the image URL as thumbnail when no separate thumbnail is provided
    const thumbUrl = thumbnail_url ?? (file.mimetype.startsWith('image/') ? fileUrl : null)
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, dimensions, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, brand, type, fileUrl, thumbUrl, file_size ?? null, dimensions ?? null, s3Key)

    notifyUsers('new_asset', 'New in Product Library', `${name} (${brand}) has been added to the Product Library.`, '/assets')
    res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(lastInsertRowid))
  } catch (err: any) {
    console.error('[assets] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── PUT /:id/file — replace file for existing asset ─────────────────────────

router.put('/:id/file', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }

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
  const { name, brand, type, file_url, thumbnail_url, file_size, dimensions } = req.body
  if (!name || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' }); return
  }
  const result = db.prepare(
    'UPDATE assets SET name=?, brand=?, type=?, file_url=?, thumbnail_url=?, file_size=?, dimensions=? WHERE id=?'
  ).run(name, brand, type, file_url, thumbnail_url ?? null, file_size ?? null, dimensions ?? null, req.params.id)
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
  notifyUsers('new_asset', 'New in Product Library', `${name} (${brand}) has been added to the Product Library.`, '/assets')
  res.status(201).json({ id: result.lastInsertRowid })
})

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT s3_key FROM assets WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
