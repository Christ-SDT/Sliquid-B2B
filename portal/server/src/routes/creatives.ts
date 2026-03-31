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

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const { brand, type, campaign, search } = req.query
  let sql = 'SELECT * FROM creatives WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  if (campaign) { sql += ' AND campaign = ?'; params.push(campaign) }
  if (search) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY brand, title'
  res.json(db.prepare(sql).all(...params))
})

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM creatives WHERE id = ?').get(req.params.id)
  if (!item) { res.status(404).json({ message: 'Not found' }); return }
  res.json(item)
})

// ─── POST /upload — new creative via S3 file upload ──────────────────────────

router.post('/upload', requireAuth, requireRole('tier5', 'admin'),
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  async (req, res) => {
  const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined
  const file = filesMap?.file?.[0]
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }

  const { title, brand, type, thumbnail_url, file_size, dimensions, description, campaign } = req.body
  if (!title || !brand || !type) {
    res.status(400).json({ message: 'Missing required fields: title, brand, type' }); return
  }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured (missing S3_BUCKET or AWS credentials)' }); return
  }

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/creatives/${randomUUID()}${ext}`
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
      const thumbKey = `portal-assets/creatives/${randomUUID()}-thumb${thumbExt}`
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket, Key: thumbKey, Body: thumbFile.buffer, ContentType: thumbFile.mimetype,
      }))
      thumbUrl = buildS3Url(bucket, region, thumbKey)
    } else {
      thumbUrl = thumbnail_url ?? (file.mimetype.startsWith('image/') ? fileUrl : null)
    }
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO creatives (title, brand, type, file_url, thumbnail_url, file_size, dimensions, description, campaign, s3_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, brand, type, fileUrl, thumbUrl, file_size ?? null, dimensions ?? null, description ?? null, campaign ?? null, s3Key)

    if (req.body.notify === 'true') {
      notifyUsers('new_asset', 'New in Product Library', `${title} (${brand}) has been added to the Product Library.`, '/assets')
      sendBroadcastEmail({ assetName: title, brand })
        .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
    }
    res.status(201).json(db.prepare('SELECT * FROM creatives WHERE id = ?').get(lastInsertRowid))
  } catch (err: any) {
    console.error('[creatives] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── POST /bulk-upload — upload multiple creatives at once ───────────────────

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
      const s3Key = `portal-assets/creatives/${randomUUID()}${ext}`
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
        const thumbKey = `portal-assets/creatives/${randomUUID()}-thumb${thumbExt}`
        await getS3Client().send(new PutObjectCommand({
          Bucket: bucket, Key: thumbKey, Body: tf.buffer, ContentType: tf.mimetype,
        }))
        thumbUrl = buildS3Url(bucket, region, thumbKey)
      }
      const baseName = file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
      const title = baseName.charAt(0).toUpperCase() + baseName.slice(1)
      const fileSize = file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

      const { lastInsertRowid } = db.prepare(
        'INSERT INTO creatives (title, brand, type, file_url, thumbnail_url, file_size, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(title, brand, type, fileUrl, thumbUrl, fileSize, s3Key)

      items.push(db.prepare('SELECT * FROM creatives WHERE id = ?').get(lastInsertRowid) as Record<string, unknown>)
    } catch (err: any) {
      errors.push(`${file.originalname}: ${err.message ?? 'upload failed'}`)
    }
  }

  if (notify === 'true' && items.length > 0) {
    notifyUsers('new_asset', 'New in Product Library', `${items.length} new file${items.length > 1 ? 's' : ''} (${brand}) added to the Product Library.`, '/assets')
    sendBroadcastEmail({ assetName: `${items.length} new file${items.length > 1 ? 's' : ''}`, brand })
      .catch((err: unknown) => console.error('[email] Broadcast failed:', err))
  }

  res.status(items.length > 0 ? 201 : 500).json({ items, count: items.length, ...(errors.length > 0 && { errors }) })
})

// ─── PUT /:id/file — replace file for existing creative ──────────────────────

router.put('/:id/file', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM creatives WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }

  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }

  const { title, brand, type, thumbnail_url, file_size, dimensions, description, campaign } = req.body

  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/creatives/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))

    const fileUrl = buildS3Url(bucket, region, s3Key)
    const thumbUrl = thumbnail_url ?? (file.mimetype.startsWith('image/') ? fileUrl : row.thumbnail_url)

    if (row.s3_key) await deleteS3Object(row.s3_key)

    db.prepare(
      'UPDATE creatives SET title=?, brand=?, type=?, file_url=?, thumbnail_url=?, file_size=?, dimensions=?, description=?, campaign=?, s3_key=? WHERE id=?'
    ).run(
      title ?? row.title, brand ?? row.brand, type ?? row.type,
      fileUrl, thumbUrl, file_size ?? null, dimensions ?? null,
      description ?? row.description, campaign ?? row.campaign, s3Key, id
    )

    res.json(db.prepare('SELECT * FROM creatives WHERE id = ?').get(id))
  } catch (err: any) {
    console.error('[creatives] file replace error:', err)
    res.status(500).json({ message: err.message ?? 'File replace failed' })
  }
})

// ─── PUT /:id — JSON metadata update ─────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { title, brand, type, campaign, thumbnail_url, file_url, description, dimensions, file_size } = req.body
  if (!title || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' }); return
  }
  const result = db.prepare(
    'UPDATE creatives SET title=?, brand=?, type=?, campaign=?, thumbnail_url=?, file_url=?, description=?, dimensions=?, file_size=? WHERE id=?'
  ).run(title, brand, type, campaign ?? null, thumbnail_url ?? null, file_url, description ?? null, dimensions ?? null, file_size ?? null, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare('SELECT * FROM creatives WHERE id = ?').get(req.params.id))
})

// ─── POST / — JSON create ─────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { title, brand, type, campaign, thumbnail_url, file_url, description, dimensions, file_size } = req.body
  if (!title || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }
  const result = db.prepare(`
    INSERT INTO creatives (title, brand, type, campaign, thumbnail_url, file_url, description, dimensions, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, brand, type, campaign ?? null, thumbnail_url ?? null, file_url, description ?? null, dimensions ?? null, file_size ?? null)
  notifyUsers('new_asset', 'New in Product Library', `${title} (${brand}) has been added to the Product Library.`, '/assets')
  res.status(201).json({ id: result.lastInsertRowid })
})

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT s3_key FROM creatives WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM creatives WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
