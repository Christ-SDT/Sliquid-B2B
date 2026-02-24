import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { state, region, search } = req.query
  let sql = 'SELECT * FROM distributors WHERE 1=1'
  const params: any[] = []
  if (state) { sql += ' AND state = ?'; params.push(state) }
  if (region) { sql += ' AND region = ?'; params.push(region) }
  if (search) {
    sql += ' AND (name LIKE ? OR city LIKE ? OR state LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  sql += ' ORDER BY region, state, name'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const dist = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id)
  if (!dist) { res.status(404).json({ message: 'Not found' }); return }
  res.json(dist)
})

export default router
