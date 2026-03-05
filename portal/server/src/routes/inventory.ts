import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'
import { notifyAdmins } from '../notifications.js'

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

router.put('/:id/quantity', requireAuth, (req, res) => {
  const { quantity } = req.body as { quantity?: unknown }
  if (typeof quantity !== 'number' || quantity < 0) {
    res.status(400).json({ message: 'quantity must be a non-negative number' })
    return
  }
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id) as any
  if (!item) { res.status(404).json({ message: 'Inventory item not found' }); return }

  const oldStatus = item.status
  const newStatus = quantity === 0 ? 'out_of_stock' : quantity <= item.reorder_level ? 'low_stock' : 'in_stock'
  db.prepare("UPDATE inventory SET quantity = ?, status = ?, last_updated = datetime('now') WHERE id = ?")
    .run(quantity, newStatus, req.params.id)

  // Notify admins only when status worsens (new alert)
  if (newStatus !== oldStatus) {
    if (newStatus === 'out_of_stock') {
      notifyAdmins('out_of_stock', 'Out of Stock', `${item.product_name} (${item.brand}) is now out of stock.`, '/inventory')
    } else if (newStatus === 'low_stock') {
      notifyAdmins('low_stock', 'Low Stock Alert', `${item.product_name} (${item.brand}) is running low — ${quantity} units remaining.`, '/inventory')
    }
  }

  res.json({ ...item, quantity, status: newStatus })
})

router.post('/bulk', requireAuth, (req, res) => {
  const { items, notes: _notes } = req.body as { items?: unknown; notes?: string }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'items must be a non-empty array' })
    return
  }
  for (const item of items) {
    if (typeof (item as any).id !== 'number' || typeof (item as any).quantity !== 'number' || (item as any).quantity < 0) {
      res.status(400).json({ message: 'each item must have numeric id and non-negative quantity' })
      return
    }
  }

  const results: Array<{ id: number; quantity: number; status: string }> = []
  // Collect status change alerts outside the transaction to avoid nested DB writes
  const alerts: Array<{ type: string; name: string; brand: string; qty: number }> = []

  const bulkUpdate = db.transaction((rows: Array<{ id: number; quantity: number }>) => {
    for (const { id, quantity } of rows) {
      const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id) as any
      if (!row) continue
      const oldStatus = row.status
      const newStatus = quantity === 0 ? 'out_of_stock' : quantity <= row.reorder_level ? 'low_stock' : 'in_stock'
      db.prepare("UPDATE inventory SET quantity = ?, status = ?, last_updated = datetime('now') WHERE id = ?")
        .run(quantity, newStatus, id)
      results.push({ id, quantity, status: newStatus })
      if (newStatus !== oldStatus && (newStatus === 'out_of_stock' || newStatus === 'low_stock')) {
        alerts.push({ type: newStatus, name: row.product_name, brand: row.brand, qty: quantity })
      }
    }
  })
  bulkUpdate(items as Array<{ id: number; quantity: number }>)

  for (const { type, name, brand, qty } of alerts) {
    if (type === 'out_of_stock') {
      notifyAdmins('out_of_stock', 'Out of Stock', `${name} (${brand}) is now out of stock.`, '/inventory')
    } else {
      notifyAdmins('low_stock', 'Low Stock Alert', `${name} (${brand}) is running low — ${qty} units remaining.`, '/inventory')
    }
  }

  res.json({ updated: results.length, results })
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
  db.prepare("UPDATE inventory SET quantity = ?, status = ?, last_updated = datetime('now') WHERE id = ?")
    .run(newQty, newStatus, inventory_id)

  res.json({ success: true, new_quantity: newQty, status: newStatus })
})

export default router
