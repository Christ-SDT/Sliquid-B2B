import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/users', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.company, u.role, u.created_at, u.last_login,
           c.certificate_number
    FROM users u
    LEFT JOIN certificates c ON c.user_id = u.id AND c.is_valid = 1
    ORDER BY u.created_at DESC
  `).all()
  res.json(users)
})

router.put('/users/:id/role', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { role } = req.body
  const validRoles = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5']
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

router.put('/users/:id/company', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { company } = req.body as { company?: string }
  if (!company?.trim()) {
    res.status(400).json({ message: 'Company is required' })
    return
  }
  const id = parseInt(req.params.id)
  const result = db.prepare('UPDATE users SET company = ? WHERE id = ?').run(company.trim(), id)
  if (result.changes === 0) { res.status(404).json({ message: 'User not found' }); return }
  res.json({ id, company: company.trim() })
})

export default router
