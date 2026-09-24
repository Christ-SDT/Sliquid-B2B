import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Notification types non-admins are allowed to see. Admin-only types (stock
// alerts, marketing requests, announcement review queue) are hidden from them.
// NOTE: a new user-facing notification type MUST be added here or it will be
// inserted for tier1–tier4 and then silently filtered out of their feed.
// `account_approved` was missing — the approval notice was written for the
// newly approved partner and then never shown to them. (`account_declined`
// stays out: declined users are blocked at login, so there is no feed to show.)
const USER_VISIBLE_TYPES = ['new_asset', 'new_announcement', 'account_approved']

// GET /api/notifications — latest 30 for current user, unread first
router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user!.role === 'tier5' || req.user!.role === 'admin'
  const typeFilter = isAdmin
    ? ''
    : `AND type IN (${USER_VISIBLE_TYPES.map(t => `'${t}'`).join(', ')})`

  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? ${typeFilter}
    ORDER BY read ASC, created_at DESC
    LIMIT 30
  `).all(req.user!.id) as { i18n_params: string | null }[]

  const { count } = db.prepare(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0 ${typeFilter}`
  ).get(req.user!.id) as { count: number }

  // i18n_params is stored as JSON text; hand the client an object (or null).
  const withParams = notifications.map(n => {
    let params: unknown = null
    try { params = n.i18n_params ? JSON.parse(n.i18n_params) : null } catch { /* malformed → fall back to English text */ }
    return { ...n, i18n_params: params }
  })

  res.json({ notifications: withParams, unreadCount: count })
})

// PUT /api/notifications/read-all — mark all as read (must be before /:id/read)
router.put('/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user!.id)
  res.json({ ok: true })
})

// PUT /api/notifications/:id/read — mark single as read
router.put('/:id/read', requireAuth, (req, res) => {
  const notif = db.prepare('SELECT user_id FROM notifications WHERE id = ?').get(req.params.id) as any
  if (!notif) { res.status(404).json({ message: 'Not found' }); return }
  if (notif.user_id !== req.user!.id) { res.status(403).json({ message: 'Forbidden' }); return }
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
