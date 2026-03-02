import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/users', requireAuth, requireRole('tier4'), (req, res) => {
  const users = db.prepare(
    'SELECT id, name, email, company, role, created_at FROM users ORDER BY created_at DESC'
  ).all()
  res.json(users)
})

router.put('/users/:id/role', requireAuth, requireRole('tier4'), (req, res) => {
  const { role } = req.body
  const validRoles = ['tier1', 'tier2', 'tier3', 'tier4']
  if (!validRoles.includes(role)) {
    res.status(400).json({ message: 'Invalid role' })
    return
  }
  const id = parseInt(req.params.id)
  const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  if (result.changes === 0) {
    res.status(404).json({ message: 'User not found' })
    return
  }
  const user = db.prepare('SELECT id, name, email, company, role, created_at FROM users WHERE id = ?').get(id)
  res.json(user)
})

export default router
