import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { brand, type, search } = req.query
  let sql = 'SELECT * FROM assets WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (type) { sql += ' AND type = ?'; params.push(type) }
  if (search) { sql += ' AND name LIKE ?'; params.push(`%${search}%`) }
  sql += ' ORDER BY brand, name'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id)
  if (!asset) { res.status(404).json({ message: 'Not found' }); return }
  res.json(asset)
})

router.post('/', requireAuth, requireRole('tier4'), (req, res) => {
  const { name, brand, type, file_url, thumbnail_url, file_size, dimensions } = req.body
  if (!name || !brand || !type || !file_url) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }
  const result = db.prepare(
    'INSERT INTO assets (name, brand, type, file_url, thumbnail_url, file_size, dimensions) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, brand, type, file_url, thumbnail_url ?? null, file_size ?? null, dimensions ?? null)
  res.status(201).json({ id: result.lastInsertRowid })
})

export default router
