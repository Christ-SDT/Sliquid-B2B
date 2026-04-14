import { Router } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notifyAdmins } from '../notifications.js'
import { sendMedicalMarketingRequestEmails } from '../email.js'

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

// ─── Parse helpers ────────────────────────────────────────────────────────────

function parseItem(row: Record<string, unknown>) {
  return {
    ...row,
    specs: JSON.parse((row.specs as string) || '[]'),
    variants: JSON.parse((row.variants as string) || '[]'),
  }
}

function parseOption(row: Record<string, unknown>) {
  return {
    ...row,
    specs: JSON.parse((row.specs as string) || '[]'),
  }
}

// ─── Items — GET ──────────────────────────────────────────────────────────────

router.get('/items', requireAuth, requireRole('tier5', 'tier6', 'admin'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM medical_marketing_items ORDER BY sort_order, id').all() as Record<string, unknown>[]
  res.json(rows.map(parseItem))
})

// ─── Items — POST /upload ─────────────────────────────────────────────────────

router.post('/items/upload', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  const { name, subtitle, description, specs, variants, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }
  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/medical-marketing/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))
    const imageUrl = buildS3Url(bucket, region, s3Key)
    const result = db.prepare(
      'INSERT INTO medical_marketing_items (name, subtitle, description, specs, variants, image_url, icon_name, sort_order, s3_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      name, subtitle ?? null, description ?? null,
      JSON.stringify(Array.isArray(specs) ? specs : (specs ? JSON.parse(specs) : [])),
      JSON.stringify(Array.isArray(variants) ? variants : (variants ? JSON.parse(variants) : [])),
      imageUrl, icon_name ?? 'Package', sort_order ?? 0, s3Key,
    )
    const row = db.prepare('SELECT * FROM medical_marketing_items WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    res.status(201).json(parseItem(row))
  } catch (err: any) {
    console.error('[medical-marketing] upload error:', err)
    res.status(500).json({ message: err.message ?? 'Upload failed' })
  }
})

// ─── Items — PUT /:id/image ───────────────────────────────────────────────────

router.put('/items/:id/image', requireAuth, requireRole('tier5', 'admin'), upload.single('file'), async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM medical_marketing_items WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  const file = req.file
  if (!file) { res.status(400).json({ message: 'No file uploaded' }); return }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    res.status(503).json({ message: 'File storage not configured' }); return
  }
  try {
    const ext = path.extname(file.originalname).toLowerCase()
    const s3Key = `portal-assets/medical-marketing/${randomUUID()}${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key, Body: file.buffer, ContentType: file.mimetype,
    }))
    const imageUrl = buildS3Url(bucket, region, s3Key)
    if (row.s3_key) await deleteS3Object(row.s3_key)
    db.prepare('UPDATE medical_marketing_items SET image_url=?, s3_key=? WHERE id=?').run(imageUrl, s3Key, id)
    const updated = db.prepare('SELECT * FROM medical_marketing_items WHERE id = ?').get(id) as Record<string, unknown>
    res.json(parseItem(updated))
  } catch (err: any) {
    console.error('[medical-marketing] image replace error:', err)
    res.status(500).json({ message: err.message ?? 'Image replace failed' })
  }
})

// ─── Items — POST / (JSON create) ─────────────────────────────────────────────

router.post('/items', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'INSERT INTO medical_marketing_items (name, subtitle, description, specs, variants, image_url, icon_name, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null, icon_name ?? 'Package', sort_order ?? 0,
  )
  const row = db.prepare('SELECT * FROM medical_marketing_items WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  res.status(201).json(parseItem(row))
})

// ─── Items — PUT /:id ─────────────────────────────────────────────────────────

router.put('/items/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'UPDATE medical_marketing_items SET name=?, subtitle=?, description=?, specs=?, variants=?, image_url=?, icon_name=?, sort_order=? WHERE id=?'
  ).run(
    name, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null, icon_name ?? 'Package', sort_order ?? 0, req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM medical_marketing_items WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseItem(row))
})

// ─── Items — DELETE /:id ──────────────────────────────────────────────────────

router.delete('/items/:id', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const row = db.prepare('SELECT s3_key FROM medical_marketing_items WHERE id = ?').get(req.params.id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.s3_key) await deleteS3Object(row.s3_key)
  db.prepare('DELETE FROM medical_marketing_items WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ─── Training Options — GET ───────────────────────────────────────────────────

router.get('/training-options', requireAuth, requireRole('tier5', 'tier6', 'admin'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM medical_training_options ORDER BY sort_order, id').all() as Record<string, unknown>[]
  res.json(rows.map(parseOption))
})

// ─── Training Options — POST ──────────────────────────────────────────────────

router.post('/training-options', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, subtitle, description, specs, icon_name, sort_order } = req.body
  if (!label) { res.status(400).json({ message: 'label is required' }); return }
  const result = db.prepare(
    'INSERT INTO medical_training_options (label, subtitle, description, specs, icon_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    label, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    icon_name ?? 'Users', sort_order ?? 0,
  )
  const row = db.prepare('SELECT * FROM medical_training_options WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  res.status(201).json(parseOption(row))
})

// ─── Training Options — PUT /:id ──────────────────────────────────────────────

router.put('/training-options/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, subtitle, description, specs, icon_name, sort_order } = req.body
  if (!label) { res.status(400).json({ message: 'label is required' }); return }
  const result = db.prepare(
    'UPDATE medical_training_options SET label=?, subtitle=?, description=?, specs=?, icon_name=?, sort_order=? WHERE id=?'
  ).run(
    label, subtitle ?? null, description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    icon_name ?? 'Users', sort_order ?? 0, req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM medical_training_options WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseOption(row))
})

// ─── Training Options — DELETE /:id ──────────────────────────────────────────

router.delete('/training-options/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM medical_training_options WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

// ─── Applications — POST /apply ───────────────────────────────────────────────

router.post('/apply', requireAuth, (req: any, res) => {
  const { contact_name, business_name, address, requested_items, request_notes } = req.body
  if (!contact_name || !business_name || !address || !requested_items) {
    res.status(400).json({ message: 'contact_name, business_name, address, and requested_items are required' })
    return
  }
  const result = db.prepare(`
    INSERT INTO medical_applications
      (user_id, contact_name, email, business_name, address, requested_items, request_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.id, contact_name, req.user!.email, business_name, address,
    requested_items, request_notes ?? null,
  )
  notifyAdmins(
    'marketing_request',
    'New Medical Marketing Request',
    `${contact_name} (${business_name}) submitted a medical request: ${requested_items}`,
    '/marketing-requests',
  )

  sendMedicalMarketingRequestEmails({
    name: req.user!.name,
    email: req.user!.email,
    company: business_name,
    requestedItems: requested_items,
    notes: request_notes ?? '',
  }).catch(err => console.error('[email] Medical marketing request emails failed:', err))

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending' })
})

// ─── Applications — GET /status ───────────────────────────────────────────────

router.get('/status', requireAuth, (req: any, res) => {
  const app = db.prepare(
    'SELECT id, business_name, requested_items, status, submitted_at, reviewed_at FROM medical_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(req.user!.id)
  res.json(app ?? null)
})

// ─── Applications — GET /applications (admin) ─────────────────────────────────

router.get('/applications', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  const apps = db.prepare(`
    SELECT
      ma.id, ma.contact_name, ma.business_name, ma.address,
      ma.requested_items, ma.request_notes, ma.status,
      ma.submitted_at, ma.reviewed_at,
      u.name  AS user_name,
      u.email AS user_email
    FROM medical_applications ma
    LEFT JOIN users u ON u.id = ma.user_id
    ORDER BY ma.submitted_at DESC
  `).all()
  res.json(apps)
})

// ─── Applications — PUT /applications/:id/status ──────────────────────────────

router.put('/applications/:id/status', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { status } = req.body
  if (!['pending', 'approved', 'declined'].includes(status)) {
    res.status(400).json({ message: 'status must be pending, approved, or declined' })
    return
  }
  const result = db.prepare(
    "UPDATE medical_applications SET status = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(status, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true, status })
})

export default router
