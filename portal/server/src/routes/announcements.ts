import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  LIVE_SQL,
  ORDER_SQL,
  LIST_COLS,
  DETAIL_COLS,
  ADMIN_COLS,
  EDITABLE_FIELDS,
  VALID_STATUSES,
  sweepScheduledAnnouncements,
} from '../announcements.js'
import {
  wp,
  runAnnouncementSync,
  normalizeTs,
  slugify,
  uniqueSlug,
  setSetting,
} from '../wordpress.js'

const router = Router()
const adminOnly = [requireAuth, requireRole('tier5', 'admin')] as const

/**
 * ROUTE ORDER MATTERS. Express matches in registration order and `/:id` is
 * indistinguishable from `/:slug`, so:
 *   - every public route lives under /public/…
 *   - every admin route lives under /admin/…
 *   - there is exactly ONE root single-segment route, `GET /:idOrSlug`, and it
 *     is registered LAST so the `public` and `admin` literals win.
 * slugify() also reserves 'public'/'admin'/'sync' so no announcement can ever
 * claim a slug that shadows one of those literals.
 */

// Generous — these are cached-ish public reads, not auth attempts.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
})

// ─── helpers ──────────────────────────────────────────────────────────────────

function isNumericId(v: string): boolean {
  return /^\d+$/.test(v)
}

type Surface = 'show_in_portal' | 'show_on_public'

/**
 * Which visibility flag applies to this request.
 *
 * Users still awaiting approval get the PUBLIC subset — the same announcements
 * anyone can already read on the B2B marketing site. That gives an unapproved
 * prospect a reason to come back without exposing partner-only announcements
 * (show_in_portal = 1, show_on_public = 0) to someone who has not been vetted.
 */
function surfaceFor(req: { user?: { status?: string } }): Surface {
  return req.user?.status === 'pending' ? 'show_on_public' : 'show_in_portal'
}

/** Shared list query for the portal and public feeds. */
function listAnnouncements(surface: Surface, req: any) {
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? '100', 10) || 100, 1), 200)
  const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0)

  let sql = `SELECT ${LIST_COLS} FROM announcements WHERE ${LIVE_SQL} AND ${surface} = 1`
  const params: any[] = []
  if (req.query.search) {
    sql += ` AND (COALESCE(title_override, wp_title) LIKE ?
                  OR COALESCE(excerpt_override, wp_excerpt_html) LIKE ?)`
    params.push(`%${req.query.search}%`, `%${req.query.search}%`)
  }
  sql += `${ORDER_SQL} LIMIT ? OFFSET ?`
  params.push(limit, offset)

  return db.prepare(sql).all(...params)
}

/** Detail lookup that re-applies the visibility predicate (never trust the slug). */
function getVisibleDetail(idOrSlug: string, surface: Surface) {
  const column = isNumericId(idOrSlug) ? 'id' : 'slug'
  const value = isNumericId(idOrSlug) ? parseInt(idOrSlug, 10) : idOrSlug
  return db.prepare(`
    SELECT ${DETAIL_COLS} FROM announcements
    WHERE ${column} = ? AND ${LIVE_SQL} AND ${surface} = 1
  `).get(value)
}

/** Pull only allowlisted fields off a request body, normalizing as we go. */
function collectEditable(body: any): { sets: Record<string, any>; error?: string } {
  const sets: Record<string, any> = {}

  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue
    const raw = body[field]

    if (field === 'publish_at' || field === 'expires_at') {
      const norm = normalizeTs(raw)
      if (norm === undefined) return { sets, error: `Invalid ${field}` }
      sets[field] = norm
      continue
    }
    if (field === 'status') {
      if (!VALID_STATUSES.includes(raw)) return { sets, error: 'Invalid status' }
      sets[field] = raw
      continue
    }
    if (['show_in_portal', 'show_on_public', 'pinned'].includes(field)) {
      sets[field] = raw ? 1 : 0
      continue
    }
    if (field === 'sort_order') {
      const n = parseInt(raw, 10)
      sets[field] = Number.isFinite(n) ? n : 0
      continue
    }
    // Free-text overrides: empty string means "clear the override".
    sets[field] = typeof raw === 'string' && raw.trim() === '' ? null : raw ?? null
  }

  return { sets }
}

function adminRow(id: number) {
  return db.prepare(`SELECT ${ADMIN_COLS} FROM announcements WHERE id = ?`).get(id)
}

// ══ 1–2. PUBLIC (no auth) — path must also be in PUBLIC_PATHS in app.ts ══════

router.get('/public', publicLimiter, (req, res) => {
  res.json(listAnnouncements('show_on_public', req))
})

router.get('/public/:idOrSlug', publicLimiter, (req, res) => {
  const row = getVisibleDetail(req.params.idOrSlug, 'show_on_public')
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  res.json(row)
})

// ══ 3–9. ADMIN ═══════════════════════════════════════════════════════════════

router.get('/admin/sync/status', ...adminOnly, (_req, res) => {
  const cfg = wp.getConfig()
  const lastSync = db.prepare(
    'SELECT * FROM announcement_sync_log ORDER BY id DESC LIMIT 1'
  ).get() ?? null

  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'hidden'   THEN 1 ELSE 0 END) AS hidden,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN ${LIVE_SQL} THEN 1 ELSE 0 END)         AS live,
      SUM(CASE WHEN status = 'published' AND publish_at IS NOT NULL
                AND publish_at > datetime('now') THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN source = 'portal'   THEN 1 ELSE 0 END) AS portal_only
    FROM announcements
  `).get()

  res.json({
    configured: wp.isConfigured(),
    enabled: wp.isSyncEnabled(),
    config: {
      baseUrl: cfg.baseUrl,
      categoryId: cfg.categoryId,
      cutoffDate: cfg.cutoffDate,
      hasAuth: !!cfg.auth,
    },
    watermark: wp.getWatermark(),
    lastSync,
    counts,
  })
})

router.post('/admin/sync', ...adminOnly, async (_req, res) => {
  try {
    res.json(await runAnnouncementSync('manual'))
  } catch (err: any) {
    console.error('[announcements] manual sync failed:', err)
    res.status(500).json({ message: err?.message ?? 'Sync failed' })
  }
})

router.post('/admin/test', ...adminOnly, async (_req, res) => {
  res.json(await wp.testConnection())
})

router.put('/admin/settings', ...adminOnly, (req, res) => {
  const { baseUrl, categoryId, cutoffDate, enabled } = req.body ?? {}

  if (baseUrl !== undefined) {
    if (typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl)) {
      res.status(400).json({ message: 'baseUrl must be an http(s) URL' }); return
    }
    setSetting('wp_base_url', baseUrl.trim())
  }
  if (categoryId !== undefined) {
    const n = parseInt(categoryId, 10)
    if (!Number.isFinite(n) || n <= 0) {
      res.status(400).json({ message: 'categoryId must be a positive integer' }); return
    }
    setSetting('wp_category_id', String(n))
  }
  if (cutoffDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDate))) {
      res.status(400).json({ message: 'cutoffDate must be YYYY-MM-DD' }); return
    }
    setSetting('wp_cutoff_date', String(cutoffDate))
  }
  if (enabled !== undefined) setSetting('wp_announcements_sync_enabled', enabled ? '1' : '0')

  res.json({ ok: true })
})

router.post('/admin/reorder', ...adminOnly, (req, res) => {
  const { order } = req.body ?? {}
  if (!Array.isArray(order)) {
    res.status(400).json({ message: 'order must be an array of announcement ids' }); return
  }
  const stmt = db.prepare('UPDATE announcements SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
  db.transaction(() => {
    order.forEach((id: any, index: number) => {
      const n = parseInt(id, 10)
      if (Number.isFinite(n)) stmt.run(index, n)
    })
  })()
  res.json({ ok: true })
})

router.get('/admin', ...adminOnly, (req, res) => {
  let sql = `SELECT ${ADMIN_COLS} FROM announcements WHERE 1=1`
  const params: any[] = []
  if (req.query.status) { sql += ' AND status = ?'; params.push(req.query.status) }
  if (req.query.source) { sql += ' AND source = ?'; params.push(req.query.source) }
  if (req.query.search) {
    sql += ' AND (COALESCE(title_override, wp_title) LIKE ? OR slug LIKE ?)'
    params.push(`%${req.query.search}%`, `%${req.query.search}%`)
  }
  sql += ORDER_SQL
  res.json(db.prepare(sql).all(...params))
})

router.get('/admin/:id', ...adminOnly, (req, res) => {
  const row = db.prepare(`
    SELECT ${ADMIN_COLS}, wp_content_html, body_html_override,
           COALESCE(body_html_override, wp_content_html) AS body_html
    FROM announcements WHERE id = ?
  `).get(parseInt(req.params.id, 10))
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  res.json(row)
})

// ══ 10–11. AUTHED PORTAL FEED ════════════════════════════════════════════════

router.get('/', requireAuth, (req, res) => {
  res.json(listAnnouncements(surfaceFor(req), req))
})

router.post('/', ...adminOnly, (req: any, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  if (!title) { res.status(400).json({ message: 'title is required' }); return }

  const { sets, error } = collectEditable(req.body ?? {})
  if (error) { res.status(400).json({ message: error }); return }

  const slug = uniqueSlug(
    req.body.slug ? slugify(req.body.slug) : slugify(title),
    c => !!db.prepare('SELECT 1 FROM announcements WHERE slug = ?').get(c),
  )

  // A portal-authored announcement stores its content in the override columns,
  // so COALESCE(override, wp_*) reads uniformly for both kinds of row.
  const columns = ['source', 'wp_id', 'slug', 'wp_title', 'content_shape', ...Object.keys(sets)]
  const values: any[] = ['portal', null, slug, title, 'rich', ...Object.values(sets)]
  columns.push('created_by')
  values.push(req.user?.id ?? null)

  const result = db.prepare(
    `INSERT INTO announcements (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`
  ).run(...values)

  const id = Number(result.lastInsertRowid)
  sweepScheduledAnnouncements()
  res.status(201).json(adminRow(id))
})

// ══ 12–17. MUTATIONS (specific paths before the bare /:id) ═══════════════════

function toggle(column: 'show_in_portal' | 'show_on_public' | 'pinned') {
  return (req: any, res: any) => {
    const id = parseInt(req.params.id, 10)
    const row = db.prepare(`SELECT ${column} AS v FROM announcements WHERE id = ?`).get(id) as
      | { v: number } | undefined
    if (!row) { res.status(404).json({ message: 'Not found' }); return }

    // Explicit value if supplied, otherwise flip.
    const next = req.body && column in req.body ? (req.body[column] ? 1 : 0) : (row.v ? 0 : 1)
    db.prepare(`UPDATE announcements SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(next, id)

    if (column === 'show_in_portal' && next === 1) sweepScheduledAnnouncements()
    res.json({ id, [column]: next })
  }
}

router.put('/:id/portal-visibility', ...adminOnly, toggle('show_in_portal'))
router.put('/:id/public-visibility', ...adminOnly, toggle('show_on_public'))
router.put('/:id/pinned', ...adminOnly, toggle('pinned'))

router.put('/:id/schedule', ...adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { status, publish_at, expires_at } = req.body ?? {}
  const sets: Record<string, any> = {}

  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ message: 'Invalid status' }); return
    }
    sets.status = status
  }
  for (const field of ['publish_at', 'expires_at'] as const) {
    if (req.body && field in req.body) {
      const norm = normalizeTs(field === 'publish_at' ? publish_at : expires_at)
      if (norm === undefined) { res.status(400).json({ message: `Invalid ${field}` }); return }
      sets[field] = norm
    }
  }
  if (!Object.keys(sets).length) {
    res.status(400).json({ message: 'Nothing to update' }); return
  }

  const assignments = Object.keys(sets).map(k => `${k} = ?`).join(', ')
  const result = db.prepare(
    `UPDATE announcements SET ${assignments}, updated_at = datetime('now') WHERE id = ?`
  ).run(...Object.values(sets), id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }

  // Publishing something already past its publish_at should notify immediately
  // rather than waiting for the next sweep tick.
  sweepScheduledAnnouncements()
  res.json(adminRow(id))
})

router.put('/:id', ...adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10)
  const existing = db.prepare('SELECT source FROM announcements WHERE id = ?').get(id) as
    | { source: string } | undefined
  if (!existing) { res.status(404).json({ message: 'Not found' }); return }

  const { sets, error } = collectEditable(req.body ?? {})
  if (error) { res.status(400).json({ message: error }); return }

  // A portal-authored row keeps its title in wp_title (there is no WP original
  // to fall back to), so let `title` write through for those.
  if (existing.source === 'portal' && typeof req.body?.title === 'string') {
    const t = req.body.title.trim()
    if (!t) { res.status(400).json({ message: 'title is required' }); return }
    sets.wp_title = t
  }

  if (typeof req.body?.slug === 'string' && req.body.slug.trim()) {
    const desired = slugify(req.body.slug)
    if (desired !== db.prepare('SELECT slug FROM announcements WHERE id = ?').get(id)) {
      sets.slug = uniqueSlug(
        desired,
        c => !!db.prepare('SELECT 1 FROM announcements WHERE slug = ? AND id <> ?').get(c, id),
      )
    }
  }

  if (!Object.keys(sets).length) { res.json(adminRow(id)); return }

  const assignments = Object.keys(sets).map(k => `${k} = ?`).join(', ')
  db.prepare(`UPDATE announcements SET ${assignments}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(sets), id)

  sweepScheduledAnnouncements()
  res.json(adminRow(id))
})

router.delete('/:id', ...adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10)
  const row = db.prepare('SELECT source FROM announcements WHERE id = ?').get(id) as
    | { source: string } | undefined
  if (!row) { res.status(404).json({ message: 'Not found' }); return }

  // Hard-deleting a WordPress-sourced row is a trap: the next sync recreates it
  // as hidden and every admin override is gone. Archive instead — it disappears
  // from both surfaces and survives re-sync.
  if (row.source === 'wordpress') {
    db.prepare(
      "UPDATE announcements SET status = 'archived', show_in_portal = 0, show_on_public = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(id)
    res.json({ ok: true, archived: true })
    return
  }

  db.prepare('DELETE FROM announcements WHERE id = ?').run(id)
  res.json({ ok: true })
})

// ══ 18. Root single-segment lookup — MUST be last ════════════════════════════

router.get('/:idOrSlug', requireAuth, (req, res) => {
  const row = getVisibleDetail(req.params.idOrSlug, surfaceFor(req))
  if (!row) { res.status(404).json({ message: 'Not found' }); return }
  res.json(row)
})

export default router
