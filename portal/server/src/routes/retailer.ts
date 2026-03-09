import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { notifyAdmins } from '../notifications.js'

const router = Router()

router.post('/apply', requireAuth, (req, res) => {
  const { contact_name, business_name, address, requested_items, request_notes } = req.body

  if (!contact_name || !business_name || !address || !requested_items) {
    res.status(400).json({ message: 'contact_name, business_name, address, and requested_items are required' })
    return
  }

  const result = db.prepare(`
    INSERT INTO retailer_applications
      (user_id, contact_name, business_name, address, requested_items, request_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.id, contact_name, business_name, address,
    requested_items, request_notes ?? null,
  )

  notifyAdmins(
    'marketing_request',
    'New Marketing Request',
    `${contact_name} (${business_name}) submitted a request: ${requested_items}`,
    '/users',
  )

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending' })
})

router.get('/status', requireAuth, (req, res) => {
  const app = db.prepare(
    'SELECT id, business_name, requested_items, status, submitted_at, reviewed_at FROM retailer_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(req.user!.id)
  res.json(app ?? null)
})

router.get('/applications', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  const apps = db.prepare(`
    SELECT
      ra.id, ra.contact_name, ra.business_name, ra.address,
      ra.requested_items, ra.request_notes, ra.status,
      ra.submitted_at, ra.reviewed_at,
      u.name  AS user_name,
      u.email AS user_email
    FROM retailer_applications ra
    LEFT JOIN users u ON u.id = ra.user_id
    ORDER BY ra.submitted_at DESC
  `).all()
  res.json(apps)
})

router.put('/applications/:id/status', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { status } = req.body
  if (!['pending', 'approved', 'declined'].includes(status)) {
    res.status(400).json({ message: 'status must be pending, approved, or declined' })
    return
  }
  const result = db.prepare(
    "UPDATE retailer_applications SET status = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(status, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true, status })
})

export default router
