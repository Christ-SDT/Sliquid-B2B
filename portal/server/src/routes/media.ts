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

// ─── GET /proxy-download — server-side fetch to avoid S3 CORS on downloads ───

router.get('/proxy-download', requireAuth, async (req, res) => {
  const { url, filename } = req.query as { url?: string; filename?: string }
  if (!url) { res.status(400).json({ message: 'url is required' }); return }
  try {
    const upstream = await fetch(url)
    if (!upstream.ok) { res.status(502).json({ message: 'Failed to fetch file' }); return }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    const rawName = filename || decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'download')
    // AI-generated names can contain characters that are invalid in an HTTP header
    // (smart quotes, em-dashes, newlines, ellipsis, emoji). Passing them straight
    // into Content-Disposition makes res.setHeader throw ERR_INVALID_CHAR → 500.
    // Provide an ASCII-safe quoted fallback plus an RFC 5987 UTF-8 encoded name.
    const asciiName = (rawName
      .replace(/[\r\n"\\]/g, '')        // drop quotes, backslashes, CR/LF
      .replace(/[^\x20-\x7E]/g, '_')    // replace any non-printable-ASCII with _
      .replace(/\s+/g, ' ')
      .trim()) || 'download'
    const encodedName = encodeURIComponent(rawName).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`)
    res.setHeader('Content-Type', contentType)
    const buffer = await upstream.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Download failed' })
  }
})

// ─── GET / — aggregated gallery from all sources ─────────────────────────────

router.get('/', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  const assets = db.prepare(`
    SELECT id, 'asset' as _source, name as label, brand, type,
           file_url, thumbnail_url, file_size, dimensions, s3_key, NULL as description,
           NULL as subtitle, NULL as campaign, NULL as mime_type, NULL as uploaded_by, created_at
    FROM assets WHERE s3_key IS NOT NULL AND s3_key NOT LIKE 'ai-images/%'
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
    SELECT id, 'ai' as _source, prompt as label,
           COALESCE(brand, 'User Generated Content') as brand, type,
           s3_url as file_url, s3_url as thumbnail_url,
           NULL as file_size, NULL as dimensions, s3_key, NULL as description,
           NULL as subtitle, NULL as campaign, NULL as mime_type, created_by as uploaded_by,
           created_at, approved, media_id
    FROM ai_images
    WHERE media_id IS NULL
  `).all() as Record<string, unknown>[]

  // Exclude media rows that were created from AI images but whose ai_images row
  // has since been deleted (orphaned rows — S3 file is gone, nothing to show).
  //
  // Packshots are excluded too: they live on the dedicated Packshots tab, which
  // is the only surface that shows their approval state. Left in the generic
  // gallery they would be editable through PUT /item/media/:id, whose type field
  // would silently rewrite type='packshot' and drop the row out of the agent
  // catalog with no warning anywhere.
  const media = db.prepare(`
    SELECT id, 'media' as _source, label, brand, type,
           file_url, file_url as thumbnail_url, file_size, dimensions,
           s3_key, NULL as description, NULL as subtitle, NULL as campaign,
           mime_type, uploaded_by, created_at, asset_id
    FROM media
    WHERE COALESCE(type, '') != 'packshot'
      AND NOT (
        s3_key LIKE 'ai-images/%'
        AND NOT EXISTS (SELECT 1 FROM ai_images WHERE media_id = media.id)
      )
  `).all() as Record<string, unknown>[]

  const all = [...assets, ...creatives, ...marketing, ...ai, ...media]
  all.sort((a, b) => {
    const da = (a.created_at as string) ?? ''
    const db2 = (b.created_at as string) ?? ''
    return da < db2 ? 1 : da > db2 ? -1 : 0
  })

  res.json(all)
})

// ─── Packshots — the admin approval gate for the MCP product-image catalog ───
//
// Packshots are `media` rows with type = 'packshot' plus the catalog columns
// added in migration v56. `approved = 1` is what makes a row visible to the
// Sliquid Brand Agent in ChatGPT (see packshots.ts `HARD_FILTER`), so these two
// endpoints are a publish switch to an external AI agent, not a bookkeeping flag.
//
// Effective status uses COALESCE(packshot_status, 'active') — byte-for-byte the
// same expression the read layer uses (packshots.ts `STATUS_SQL`). If this
// diverged, the admin UI would claim a row is one thing while the agent is
// served another.

const PACKSHOT_STATUS_SQL = "COALESCE(m.packshot_status, 'active')"

// Selects from `media` and `products` only. Never joins `users` or
// `cert_rewards` — no column that could carry personal data belongs on a
// surface whose whole job is deciding what an external agent may see.
const PACKSHOT_SELECT = `
  SELECT m.id, m.label, m.filename, m.brand, m.type,
         m.file_url, m.file_url AS thumbnail_url, m.file_size, m.dimensions,
         m.mime_type, m.s3_key, m.created_at,
         m.sku, m.unit_size, m.package_version,
         ${PACKSHOT_STATUS_SQL} AS packshot_status,
         m.approved, m.sha256, m.asset_key,
         m.approved_by, m.approved_at,
         p.name     AS product_name,
         p.category AS product_category,
         p.brand    AS product_brand,
         p.upc      AS product_upc
  FROM media m
  LEFT JOIN products p ON p.sku = m.sku
`

const VALID_PACKSHOT_STATUSES = ['active', 'discontinued', 'pending_approval']

function getPackshotRow(id: number | bigint) {
  return db
    .prepare(`${PACKSHOT_SELECT} WHERE m.id = ? AND m.type = 'packshot'`)
    .get(id) as Record<string, unknown> | undefined
}

function packshotCounts() {
  return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN m.approved = 1 AND ${PACKSHOT_STATUS_SQL} = 'active'  THEN 1 ELSE 0 END) AS live,
      SUM(CASE WHEN m.approved = 0 AND ${PACKSHOT_STATUS_SQL} <> 'discontinued' THEN 1 ELSE 0 END) AS awaiting,
      SUM(CASE WHEN ${PACKSHOT_STATUS_SQL} = 'discontinued' THEN 1 ELSE 0 END) AS discontinued,
      SUM(CASE WHEN m.approved = 1 AND ${PACKSHOT_STATUS_SQL} <> 'active' THEN 1 ELSE 0 END) AS approved_not_active
    FROM media m WHERE m.type = 'packshot'
  `).get() as Record<string, number>
}

// ─── GET /packshots — list packshots for the approval queue ──────────────────

router.get('/packshots', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { status, approved, search } = req.query as {
    status?: string; approved?: string; search?: string
  }

  const where: string[] = ["m.type = 'packshot'"]
  const params: unknown[] = []

  if (status && status !== 'all') {
    if (!VALID_PACKSHOT_STATUSES.includes(status)) {
      res.status(400).json({ message: `Unknown status: ${status}` }); return
    }
    where.push(`${PACKSHOT_STATUS_SQL} = ?`)
    params.push(status)
  }

  if (approved && approved !== 'all') {
    const wantApproved = approved === 'true' || approved === '1'
    where.push('m.approved = ?')
    params.push(wantApproved ? 1 : 0)
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`
    where.push(`(
      LOWER(COALESCE(p.name, ''))     LIKE ? OR
      LOWER(COALESCE(m.label, ''))    LIKE ? OR
      LOWER(COALESCE(m.sku, ''))      LIKE ? OR
      LOWER(COALESCE(m.filename, '')) LIKE ? OR
      LOWER(COALESCE(m.asset_key,'')) LIKE ?
    )`)
    params.push(q, q, q, q, q)
  }

  try {
    const rows = db.prepare(`
      ${PACKSHOT_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY m.approved ASC, COALESCE(p.name, m.label, m.filename) COLLATE NOCASE ASC
    `).all(...params) as Record<string, unknown>[]

    // Counts are deliberately computed over the FULL packshot set, not the
    // filtered one — the summary header must always answer "how much is live to
    // the agent right now", which a search box should not be able to change.
    res.json({ items: rows, count: rows.length, counts: packshotCounts() })
  } catch (err: any) {
    console.error('[media] packshots list error:', err)
    res.status(500).json({ message: err.message ?? 'Failed to load packshots' })
  }
})

// ─── PUT /packshots/:id/approved — the publish switch ────────────────────────

router.put('/packshots/:id/approved', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: 'Invalid id' }); return
  }

  const { approved } = req.body ?? {}
  if (typeof approved !== 'boolean') {
    res.status(400).json({ message: 'approved must be a boolean' }); return
  }

  const row = getPackshotRow(id)
  if (!row) { res.status(404).json({ message: 'Packshot not found' }); return }

  // Guards apply to approving only. Un-approving is always allowed: pulling an
  // asset back from the agent must never be blocked by the state of the row.
  if (approved) {
    const effectiveStatus = row.packshot_status as string
    if (effectiveStatus !== 'active') {
      res.status(400).json({
        message: `Cannot approve a ${effectiveStatus} packshot. Only active packshots may be served to the Brand Agent.`,
      })
      return
    }
    if (!row.sha256) {
      res.status(400).json({
        message: 'Cannot approve a packshot with no sha256 — the file contents are unverifiable. Re-run the import to hash it.',
      })
      return
    }
    if (!row.asset_key) {
      res.status(400).json({
        message: 'Cannot approve a packshot with no asset_key — the agent would have no stable way to address it. Re-run the import to assign one.',
      })
      return
    }
  }

  try {
    // Record the actor on both directions. A revoke is as much a decision as a
    // publish, and knowing who pulled an asset back matters just as much.
    db.prepare(`
      UPDATE media
         SET approved = ?, approved_by = ?, approved_at = datetime('now')
       WHERE id = ? AND type = 'packshot'
    `).run(approved ? 1 : 0, req.user!.email, id)
    res.json({ item: getPackshotRow(id), counts: packshotCounts() })
  } catch (err: any) {
    console.error('[media] packshot approve error:', err)
    res.status(500).json({ message: err.message ?? 'Failed to update approval' })
  }
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
      const result = db.prepare(
        'UPDATE ai_images SET brand=?, type=? WHERE id=?'
      ).run(b.brand ?? null, b.type ?? null, id)
      if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
      const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
      return res.json({
        ...row, _source: 'ai', label: row.prompt,
        brand: row.brand ?? 'User Generated Content',
        file_url: row.s3_url, thumbnail_url: row.s3_url,
        uploaded_by: row.created_by, approved: row.approved,
      })
    }

    if (source === 'media') {
      // This handler writes `type`, and `type = 'packshot'` is half of what
      // makes a row part of the agent catalog. Letting a packshot through here
      // means a stray edit silently drops it out of the catalog — or, worse,
      // stamps type='packshot' onto an arbitrary media row. Packshots are
      // managed only through /packshots, which understands the approval gate.
      const current = db.prepare('SELECT type FROM media WHERE id = ?').get(id) as any
      if (current?.type === 'packshot' || b.type === 'packshot') {
        res.status(400).json({ message: 'Packshots are managed from the Packshots tab, not the media editor' })
        return
      }
      const result = db.prepare(
        'UPDATE media SET label=?, brand=?, type=? WHERE id=?'
      ).run(b.label ?? null, b.brand ?? 'Sliquid', b.type ?? null, id)
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
      const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      if (row.s3_key) await deleteS3Object(row.s3_key)
      if (row.media_id) db.prepare('DELETE FROM media  WHERE id = ?').run(row.media_id)
      if (row.asset_id) db.prepare('DELETE FROM assets WHERE id = ?').run(row.asset_id)
      db.prepare('DELETE FROM ai_images WHERE id = ?').run(id)
      return res.json({ ok: true })
    }

    if (source === 'media') {
      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
      if (!row) { res.status(404).json({ message: 'Not found' }); return }
      // If this media entry was created from an AI image, delete the AI image too
      const aiRow = db.prepare('SELECT * FROM ai_images WHERE media_id = ?').get(id) as any
      if (aiRow) {
        if (aiRow.s3_key) await deleteS3Object(aiRow.s3_key)
        if (aiRow.asset_id) db.prepare('DELETE FROM assets WHERE id = ?').run(aiRow.asset_id)
        db.prepare('DELETE FROM ai_images WHERE id = ?').run(aiRow.id)
      } else if (row.s3_key) {
        await deleteS3Object(row.s3_key)
      }
      db.prepare('DELETE FROM media WHERE id = ?').run(id)
      return res.json({ ok: true })
    }
  } catch (err: any) {
    console.error('[media] delete error:', err)
    res.status(500).json({ message: err.message ?? 'Delete failed' })
  }
})

// ─── POST /item/media/:id/add-to-assets ──────────────────────────────────────

router.post('/item/media/:id/add-to-assets', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.asset_id) {
    const updated = { ...row, _source: 'media', thumbnail_url: row.file_url }
    return res.json(updated)
  }
  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, s3_key, file_size, dimensions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      row.label || row.filename || 'Untitled',
      row.brand || 'Sliquid',
      row.type || 'Other',
      row.file_url, row.file_url,
      row.s3_key, row.file_size ?? null, row.dimensions ?? null,
    )
    db.prepare('UPDATE media SET asset_id = ? WHERE id = ?').run(lastInsertRowid, id)
    const updated = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
    return res.json({ ...updated, _source: 'media', thumbnail_url: updated.file_url })
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Failed' })
  }
})

// ─── POST /item/ai/:id/add-to-assets ─────────────────────────────────────────
// Saves an AI image to the admin-only Media Library (media table), NOT the assets table.
// "Approve to Creator Creations" is the only way to make an image visible to all users.

router.post('/item/ai/:id/add-to-assets', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (row.media_id) { return res.json({ ...row, _source: 'ai' }) }
  try {
    const label = row.prompt?.slice(0, 80) || 'AI Generated Image'
    const { lastInsertRowid: mediaRowId } = db.prepare(
      'INSERT INTO media (filename, label, brand, type, s3_key, file_url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      label, label,
      row.brand || 'User Generated Content',
      row.type || 'AI Generated',
      row.s3_key, row.s3_url,
      row.created_by || 'Admin',
    )
    db.prepare('UPDATE ai_images SET media_id = ? WHERE id = ?').run(mediaRowId, id)

    // If the AI image was already approved for User Creations, carry that state
    // over to the new media row so it shows as "Published to User Creations"
    if (row.approved) {
      const assetId = row.asset_id ?? (() => {
        const { lastInsertRowid: aid } = db.prepare(
          'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, s3_key) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(label, row.brand || 'User Generated Content', 'AI Generated', row.s3_url, row.s3_url, row.s3_key)
        db.prepare('UPDATE ai_images SET asset_id = ? WHERE id = ?').run(aid, id)
        return aid
      })()
      db.prepare('UPDATE media SET asset_id = ? WHERE id = ?').run(assetId, mediaRowId)
    }

    const updated = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
    return res.json({ ...updated, _source: 'ai' })
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Failed' })
  }
})

// ─── DELETE /item/ai/:id/remove-from-assets ───────────────────────────────────

router.delete('/item/ai/:id/remove-from-assets', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (!row.media_id) { return res.json({ ...row, _source: 'ai' }) }
  try {
    db.prepare('DELETE FROM media WHERE id = ?').run(row.media_id)
    db.prepare('UPDATE ai_images SET media_id = NULL WHERE id = ?').run(id)
    const updated = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
    return res.json({ ...updated, _source: 'ai' })
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Failed' })
  }
})

// ─── DELETE /item/media/:id/remove-from-assets ────────────────────────────────

router.delete('/item/media/:id/remove-from-assets', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  if (!row.asset_id) {
    return res.json({ ...row, _source: 'media', thumbnail_url: row.file_url })
  }
  try {
    db.prepare('DELETE FROM assets WHERE id = ?').run(row.asset_id)
    db.prepare('UPDATE media SET asset_id = NULL WHERE id = ?').run(id)

    // Also unapprove the originating AI image so it no longer shows in Creator Creations
    const aiRow = db.prepare('SELECT * FROM ai_images WHERE media_id = ?').get(id) as any
    if (aiRow) {
      db.prepare('UPDATE ai_images SET approved = 0, asset_id = NULL WHERE id = ?').run(aiRow.id)
    }

    const updated = db.prepare('SELECT * FROM media WHERE id = ?').get(id) as any
    return res.json({ ...updated, _source: 'media', thumbnail_url: updated.file_url })
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Failed' })
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
