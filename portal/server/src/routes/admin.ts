import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { sendApprovalEmail, sendDeclineEmail } from '../email.js'
import { notifyUser } from '../notifications.js'

const router = Router()

router.get('/users', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const statusFilter = (req.query.status as string) || null
  const users = statusFilter
    ? db.prepare(`
        SELECT u.id, u.name, u.email, u.company, u.role, u.created_at, u.last_login, u.status,
               c.certificate_number
        FROM users u
        LEFT JOIN certificates c ON c.user_id = u.id AND c.is_valid = 1
        WHERE u.status = ?
        ORDER BY u.created_at DESC
      `).all(statusFilter)
    : db.prepare(`
        SELECT u.id, u.name, u.email, u.company, u.role, u.created_at, u.last_login, u.status,
               c.certificate_number
        FROM users u
        LEFT JOIN certificates c ON c.user_id = u.id AND c.is_valid = 1
        ORDER BY u.created_at DESC
      `).all()
  res.json(users)
})

router.put('/users/:id/role', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { role } = req.body
  const validRoles = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6']
  if (!validRoles.includes(role)) {
    res.status(400).json({ message: 'Invalid role' })
    return
  }
  const id = parseInt(req.params.id)
  const result = db.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ?").run(role, id)
  if (result.changes === 0) {
    res.status(404).json({ message: 'User not found' })
    return
  }
  const user = db.prepare('SELECT id, name, email, company, role, created_at FROM users WHERE id = ?').get(id)
  res.json(user)
})

router.post('/users/:id/approve', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { role } = req.body
  const validRoles = ['tier1', 'tier2', 'tier3', 'tier4', 'tier6']
  if (!validRoles.includes(role)) {
    res.status(400).json({ message: 'Invalid role for approval' })
    return
  }
  const id = parseInt(req.params.id)
  const result = db.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ?").run(role, id)
  if (result.changes === 0) { res.status(404).json({ message: 'User not found' }); return }
  const user = db.prepare('SELECT id, name, email, company, role, status, created_at FROM users WHERE id = ?').get(id) as { name: string; email: string; role: string } | undefined
  if (user) {
    sendApprovalEmail({ name: user.name, email: user.email, role: user.role })
      .catch(err => console.error('[email] Approval email failed:', err))
    notifyUser(id, 'account_approved', 'Your account has been approved!',
      'Welcome to the Sliquid Partner Portal. You can now log in and access your account.', '/dashboard')
  }
  res.json(user)
})

router.post('/users/:id/decline', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = parseInt(req.params.id)
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(id) as { name: string; email: string } | undefined
  const result = db.prepare("UPDATE users SET status = 'declined' WHERE id = ?").run(id)
  if (result.changes === 0) { res.status(404).json({ message: 'User not found' }); return }
  if (user) {
    sendDeclineEmail({ name: user.name, email: user.email })
      .catch(err => console.error('[email] Decline email failed:', err))
    notifyUser(id, 'account_declined', 'Registration Update',
      'Your registration request was not approved at this time. Please contact support@sliquid.com for more information.')
  }
  res.json({ id, status: 'declined' })
})

router.delete('/users/:id', requireAuth, requireRole('tier5', 'admin'), (req: any, res) => {
  const id = parseInt(req.params.id)
  if (id === req.user?.id) {
    res.status(400).json({ message: 'You cannot delete your own account' })
    return
  }
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined
  if (!target) { res.status(404).json({ message: 'User not found' }); return }
  if (target.role === 'tier5' || target.role === 'admin') {
    res.status(403).json({ message: 'Admin accounts cannot be deleted' })
    return
  }
  // Delete child rows that lack ON DELETE CASCADE before removing the user
  const deleteUser = db.transaction((userId: number) => {
    db.prepare('DELETE FROM quiz_results WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM retailer_applications WHERE user_id = ?').run(userId)
    db.prepare('UPDATE invoices SET partner_id = NULL WHERE partner_id = ?').run(userId)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  })
  deleteUser(id)
  res.json({ id, deleted: true })
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
