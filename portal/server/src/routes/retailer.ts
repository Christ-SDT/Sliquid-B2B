import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

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

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending' })
})

router.get('/status', requireAuth, (req, res) => {
  const app = db.prepare(
    'SELECT id, business_name, requested_items, status, submitted_at, reviewed_at FROM retailer_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(req.user!.id)
  res.json(app ?? null)
})

export default router
