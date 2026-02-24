import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { brand, category, search } = req.query
  let sql = 'SELECT * FROM products WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (search) { sql += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY brand, name'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!product) { res.status(404).json({ message: 'Not found' }); return }
  res.json(product)
})

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { name, brand, category, sku, description, price, image_url, in_stock } = req.body
  if (!name || !brand || !category || !sku || !price) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }
  const result = db.prepare(
    'INSERT INTO products (name, brand, category, sku, description, price, image_url, in_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, brand, category, sku, description ?? null, price, image_url ?? null, in_stock ?? 1)
  res.status(201).json({ id: result.lastInsertRowid })
})

export default router
