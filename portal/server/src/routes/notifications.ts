import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/notifications — latest 30 for current user, unread first
router.get('/', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY read ASC, created_at DESC
    LIMIT 30
  `).all(req.user!.id)

  const { count } = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.user!.id) as { count: number }

  res.json({ notifications, unreadCount: count })
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
