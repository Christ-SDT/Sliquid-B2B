import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/apply', requireAuth, (req, res) => {
  const {
    business_name, business_type, contact_name, email, phone,
    address, city, state, zip, website, annual_revenue, how_heard,
  } = req.body

  if (!business_name || !contact_name || !email) {
    res.status(400).json({ message: 'business_name, contact_name, and email are required' })
    return
  }

  const existing = db.prepare('SELECT id FROM retailer_applications WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ message: 'An application with this email already exists' })
    return
  }

  const result = db.prepare(`
    INSERT INTO retailer_applications
      (user_id, business_name, business_type, contact_name, email, phone, address, city, state, zip, website, annual_revenue, how_heard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.id, business_name, business_type ?? null, contact_name, email,
    phone ?? null, address ?? null, city ?? null, state ?? null, zip ?? null,
    website ?? null, annual_revenue ?? null, how_heard ?? null,
  )

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending' })
})

router.get('/status', requireAuth, (req, res) => {
  const app = db.prepare(
    'SELECT id, business_name, status, submitted_at, reviewed_at FROM retailer_applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1'
  ).get(req.user!.id)
  res.json(app ?? null)
})

export default router
