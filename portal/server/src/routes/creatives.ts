import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { brand, type, campaign, search } = req.query
  let sql = 'SELECT * FROM creatives WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  if (campaign) { sql += ' AND campaign = ?'; params.push(campaign) }
  if (search) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY brand, title'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM creatives WHERE id = ?').get(req.params.id)
  if (!item) { res.status(404).json({ message: 'Not found' }); return }
  res.json(item)
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { title, brand, type, campaign, thumbnail_url, file_url, description, dimensions, file_size } = req.body
  if (!title || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }
  const result = db.prepare(`
    INSERT INTO creatives (title, brand, type, campaign, thumbnail_url, file_url, description, dimensions, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, brand, type, campaign ?? null, thumbnail_url ?? null, file_url, description ?? null, dimensions ?? null, file_size ?? null)
  res.status(201).json({ id: result.lastInsertRowid })
})

export default router
