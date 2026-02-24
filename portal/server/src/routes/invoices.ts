import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const { status, search } = req.query
  const user = req.user!
  let sql = 'SELECT * FROM invoices WHERE 1=1'
  const params: any[] = []
  if (user.role !== 'admin') { sql += ' AND partner_id = ?'; params.push(user.id) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (search) { sql += ' AND invoice_number LIKE ?'; params.push(`%${search}%`) }
  sql += ' ORDER BY issued_date DESC'
  const rows = db.prepare(sql).all(...params) as any[]
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })))
})

router.get('/:id', requireAuth, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any
  if (!invoice) { res.status(404).json({ message: 'Not found' }); return }
  if (req.user!.role !== 'admin' && invoice.partner_id !== req.user!.id) {
    res.status(403).json({ message: 'Forbidden' }); return
  }
  res.json({ ...invoice, items: JSON.parse(invoice.items) })
})

export default router
