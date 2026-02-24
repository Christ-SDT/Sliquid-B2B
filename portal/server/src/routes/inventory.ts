import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { brand, status, search } = req.query
  let sql = 'SELECT * FROM inventory WHERE 1=1'
  const params: any[] = []
  if (brand) { sql += ' AND brand = ?'; params.push(brand) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (search) { sql += ' AND (product_name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY brand, product_name'
  res.json(db.prepare(sql).all(...params))
})

router.post('/restock', requireAuth, (req, res) => {
  const { inventory_id, quantity } = req.body
  if (!inventory_id || !quantity || quantity <= 0) {
    res.status(400).json({ message: 'inventory_id and positive quantity required' })
    return
  }
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventory_id) as any
  if (!item) { res.status(404).json({ message: 'Inventory item not found' }); return }

  const newQty = item.quantity + quantity
  const newStatus = newQty === 0 ? 'out_of_stock' : newQty <= item.reorder_level ? 'low_stock' : 'in_stock'
  db.prepare('UPDATE inventory SET quantity = ?, status = ?, last_updated = datetime(\'now\') WHERE id = ?')
    .run(newQty, newStatus, inventory_id)

  res.json({ success: true, new_quantity: newQty, status: newStatus })
})

export default router
