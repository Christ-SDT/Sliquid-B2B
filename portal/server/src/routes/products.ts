import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

/**
 * Resolve a product's image and discontinued flag from its PRIMARY packshot.
 *
 * `products.image_url` is only ever written by the CSV import, so before this
 * the two image systems could not agree: a packshot uploaded and approved for
 * the Brand Agent was invisible to the catalog, and the catalog's image was
 * invisible to the agent. Reading through COALESCE makes the packshot the single
 * place to set a product's main image, while leaving an explicit `image_url`
 * override winning — the same precedence the announcements code already uses for
 * `COALESCE(override, wp_*)`.
 *
 * ⚠️ Requires `approved = 1`. These rows feed the PUBLIC catalog and the
 * marketing site, so an image nobody has reviewed must not reach a customer;
 * "published" means one thing everywhere. A product whose only packshot is still
 * awaiting approval therefore shows no image — GET /api/media/packshots/coverage
 * is what makes that visible instead of merely absent.
 *
 * ⚠️ Does NOT require status = 'active'. A discontinued product still has a
 * correct image, and showing it alongside a discontinued flag is more useful than
 * falling back to nothing. That is why the status comes back as its own field.
 */
const PRIMARY_PACKSHOT_SQL = `(
  SELECT m.file_url FROM media m
   WHERE m.type = 'packshot' AND m.sku = p.sku
     AND m.is_primary = 1 AND m.approved = 1
   LIMIT 1
)`

/**
 * The discontinued signal lives on the packshot, not on the product — `products`
 * has no such column. This surfaces the primary packshot's status so the catalog
 * can badge a discontinued item rather than quietly keep selling it. NULL means
 * "no primary packshot", which is not the same as active.
 */
const PRIMARY_STATUS_SQL = `(
  SELECT COALESCE(m.packshot_status, 'active') FROM media m
   WHERE m.type = 'packshot' AND m.sku = p.sku
     AND m.is_primary = 1 AND m.approved = 1
   LIMIT 1
)`

router.get('/', requireAuth, (req, res) => {
  const { brand, category, search } = req.query
  let sql = `SELECT p.*,
                    COALESCE(p.image_url, ${PRIMARY_PACKSHOT_SQL}) AS image_url,
                    ${PRIMARY_STATUS_SQL} AS primary_packshot_status
               FROM products p WHERE 1=1`
  const params: any[] = []
  if (brand) { sql += ' AND p.brand = ?'; params.push(brand) }
  if (category) { sql += ' AND p.category = ?'; params.push(category) }
  if (search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY p.brand, p.name'
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

// Public catalog — no auth required; omits wholesale pricing (price, case_cost)
router.get('/catalog', (req, res) => {
  const { brand, category, search } = req.query
  let sql = `SELECT p.id, p.name, p.brand, p.category, p.in_stock, p.unit_size,
               p.unit_msrp, p.case_pack, p.case_weight, p.unit_dimensions, p.case_dimensions,
               p.description, p.is_new,
               COALESCE(p.image_url, ${PRIMARY_PACKSHOT_SQL}) AS image_url,
               ${PRIMARY_STATUS_SQL} AS primary_packshot_status
             FROM products p WHERE p.name NOT LIKE '%Multilingual%'`
  const params: any[] = []
  if (brand) { sql += ' AND p.brand = ?'; params.push(brand) }
  if (category) { sql += ' AND p.category = ?'; params.push(category) }
  if (search) { sql += ' AND p.name LIKE ?'; params.push(`%${search}%`) }
  sql += ' ORDER BY p.is_new DESC, p.brand, p.name'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const product = db.prepare(`
    SELECT p.*,
           COALESCE(p.image_url, ${PRIMARY_PACKSHOT_SQL}) AS image_url,
           ${PRIMARY_STATUS_SQL} AS primary_packshot_status
      FROM products p WHERE p.id = ?
  `).get(req.params.id)
  if (!product) { res.status(404).json({ message: 'Not found' }); return }
  res.json(product)
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const {
    name, brand, category, sku, description, price, image_url, in_stock,
    unit_size, case_pack, case_cost, unit_msrp, vendor_number, upc,
    case_weight, unit_dimensions, case_dimensions, is_new,
  } = req.body
  if (!name || !brand || !sku || price == null) {
    res.status(400).json({ message: 'name, brand, sku, and price are required' })
    return
  }
  const result = db.prepare(`
    INSERT INTO products
      (name, brand, category, sku, description, price, image_url, in_stock,
       unit_size, case_pack, case_cost, unit_msrp, vendor_number, upc,
       case_weight, unit_dimensions, case_dimensions, is_new)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, brand, category ?? 'Uncategorized', sku,
    description ?? null, Number(price), image_url ?? null, in_stock ?? 1,
    unit_size ?? null, case_pack ? Number(case_pack) : null, case_cost ? Number(case_cost) : null,
    unit_msrp ? Number(unit_msrp) : null, vendor_number ?? null, upc ?? null,
    case_weight ?? null, unit_dimensions ?? null, case_dimensions ?? null,
    is_new ? 1 : 0
  )
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(created)
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id)
  if (!existing) { res.status(404).json({ message: 'Not found' }); return }

  const {
    name, brand, category, sku, description, price, image_url, in_stock,
    unit_size, case_pack, case_cost, unit_msrp, vendor_number, upc,
    case_weight, unit_dimensions, case_dimensions, is_new,
  } = req.body

  if (!name || !brand || !sku || price == null) {
    res.status(400).json({ message: 'name, brand, sku, and price are required' })
    return
  }

  db.prepare(`
    UPDATE products SET
      name = ?, brand = ?, category = ?, sku = ?, description = ?, price = ?,
      image_url = ?, in_stock = ?, unit_size = ?, case_pack = ?, case_cost = ?,
      unit_msrp = ?, vendor_number = ?, upc = ?, case_weight = ?,
      unit_dimensions = ?, case_dimensions = ?, is_new = ?
    WHERE id = ?
  `).run(
    name, brand, category ?? 'Uncategorized', sku,
    description ?? null, Number(price), image_url ?? null, in_stock ?? 1,
    unit_size ?? null, case_pack ? Number(case_pack) : null, case_cost ? Number(case_cost) : null,
    unit_msrp ? Number(unit_msrp) : null, vendor_number ?? null, upc ?? null,
    case_weight ?? null, unit_dimensions ?? null, case_dimensions ?? null,
    is_new ? 1 : 0,
    req.params.id
  )

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  res.json(updated)
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id)
  if (!existing) { res.status(404).json({ message: 'Not found' }); return }
  db.transaction(() => {
    db.prepare('DELETE FROM inventory WHERE product_id = ?').run(req.params.id)
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
  })()
  res.json({ ok: true })
})

export default router
