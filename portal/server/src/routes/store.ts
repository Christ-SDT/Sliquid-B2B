import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/store/members
// Tier2 (Retail Management): sees users with same company + quiz results
// Tier5/admin: sees all non-admin users, optionally filtered by ?company=
router.get('/members', requireAuth, (req, res) => {
  const { role, company } = req.user!
  const isAdmin = role === 'tier5' || role === 'admin'
  const isManager = role === 'tier2'

  if (!isAdmin && !isManager) {
    res.status(403).json({ message: 'Forbidden' })
    return
  }

  let sql = `SELECT id, name, email, company, role, created_at FROM users
             WHERE role NOT IN ('tier5', 'admin')`
  const params: string[] = []

  if (isManager) {
    // Managers only see their own store
    sql += ' AND company = ?'
    params.push(company ?? '')
  } else if (req.query.company) {
    // Admin can filter by company
    sql += ' AND company = ?'
    params.push(req.query.company as string)
  }

  sql += ' ORDER BY created_at DESC'
  const users = db.prepare(sql).all(...params) as any[]

  // Attach quiz summary for each user
  const quizSummary = db.prepare(`
    SELECT user_id, COUNT(*) as total, SUM(passed) as passed
    FROM quiz_results GROUP BY user_id
  `).all() as { user_id: number; total: number; passed: number }[]

  const quizMap = new Map(quizSummary.map(r => [r.user_id, r]))

  const result = users.map(u => ({
    ...u,
    quizzes_total: quizMap.get(u.id)?.total ?? 0,
    quizzes_passed: quizMap.get(u.id)?.passed ?? 0,
  }))

  res.json(result)
})

export default router
