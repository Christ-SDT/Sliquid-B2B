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

router.get('/export', requireAuth, (_req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY brand, name').all() as Record<string, any>[]
  const columns = [
    'name', 'brand', 'category', 'sku', 'description', 'price',
    'unit_size', 'case_pack', 'case_cost', 'unit_msrp',
    'vendor_number', 'upc', 'case_weight', 'unit_dimensions', 'case_dimensions', 'in_stock',
  ]
  const esc = (v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`
  const lines = [
    columns.join(','),
    ...products.map(p => columns.map(c => esc(p[c])).join(',')),
  ]
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="sliquid-products.csv"')
  res.send(lines.join('\r\n'))
})

router.post('/import', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { rows } = req.body as { rows?: Record<string, any>[] }
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ message: 'rows array is required' })
    return
  }
  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const row of rows) {
    if (!row.sku) { errors.push(`Row missing SKU — skipped`); continue }
    try {
      const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(row.sku)
      if (existing) {
        db.prepare(`
          UPDATE products SET
            name = COALESCE(?, name), brand = COALESCE(?, brand), category = COALESCE(?, category),
            description = COALESCE(?, description), price = COALESCE(?, price),
            unit_size = COALESCE(?, unit_size), case_pack = COALESCE(?, case_pack),
            case_cost = COALESCE(?, case_cost), unit_msrp = COALESCE(?, unit_msrp),
            vendor_number = COALESCE(?, vendor_number), upc = COALESCE(?, upc),
            case_weight = COALESCE(?, case_weight), unit_dimensions = COALESCE(?, unit_dimensions),
            case_dimensions = COALESCE(?, case_dimensions), in_stock = COALESCE(?, in_stock)
          WHERE sku = ?
        `).run(
          row.name || null, row.brand || null, row.category || null,
          row.description || null, row.price ? Number(row.price) : null,
          row.unit_size || null, row.case_pack ? Number(row.case_pack) : null,
          row.case_cost ? Number(row.case_cost) : null, row.unit_msrp ? Number(row.unit_msrp) : null,
          row.vendor_number || null, row.upc || null,
          row.case_weight || null, row.unit_dimensions || null, row.case_dimensions || null,
          row.in_stock != null ? Number(row.in_stock) : null,
          row.sku
        )
        updated++
      } else {
        if (!row.name || !row.brand) { errors.push(`SKU ${row.sku}: name and brand required for new products`); continue }
        db.prepare(`
          INSERT INTO products
            (name, brand, category, sku, description, price, unit_size, case_pack, case_cost, unit_msrp,
             vendor_number, upc, case_weight, unit_dimensions, case_dimensions, in_stock)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.name, row.brand, row.category || 'Uncategorized', row.sku,
          row.description || null, Number(row.price) || 0,
          row.unit_size || null, row.case_pack ? Number(row.case_pack) : null,
          row.case_cost ? Number(row.case_cost) : null, row.unit_msrp ? Number(row.unit_msrp) : null,
          row.vendor_number || null, row.upc || null,
          row.case_weight || null, row.unit_dimensions || null, row.case_dimensions || null,
          row.in_stock != null ? Number(row.in_stock) : 1
        )
        inserted++
      }
    } catch (e: any) {
      errors.push(`SKU ${row.sku}: ${e.message}`)
    }
  }
  res.json({ inserted, updated, errors })
})

router.get('/:id', requireAuth, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!product) { res.status(404).json({ message: 'Not found' }); return }
  res.json(product)
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
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
