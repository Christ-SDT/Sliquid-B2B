import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/stores — public (no auth required — used on registration page)
router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT id, name FROM stores ORDER BY name').all())
})

// POST /api/stores — admin only, add a new store
router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name } = req.body as { name?: string }
  if (!name?.trim()) {
    res.status(400).json({ message: 'Store name is required' })
    return
  }
  const existing = db.prepare('SELECT id FROM stores WHERE name = ?').get(name.trim())
  if (existing) {
    res.status(409).json({ message: 'A store with that name already exists' })
    return
  }
  const result = db.prepare('INSERT INTO stores (name) VALUES (?)').run(name.trim())
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim() })
})

// DELETE /api/stores/:id — admin only
router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Store not found' }); return }
  res.json({ ok: true })
})

export default router
