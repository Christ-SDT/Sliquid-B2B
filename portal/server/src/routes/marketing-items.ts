import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

function parseItem(row: Record<string, unknown>) {
  return {
    ...row,
    specs: JSON.parse((row.specs as string) || '[]'),
    variants: JSON.parse((row.variants as string) || '[]'),
  }
}

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM marketing_items ORDER BY sort_order, id').all() as Record<string, unknown>[]
  res.json(rows.map(parseItem))
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'INSERT INTO marketing_items (name, subtitle, description, specs, variants, image_url, icon_name, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name,
    subtitle ?? null,
    description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null,
    icon_name ?? 'Package',
    sort_order ?? 0,
  )
  const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  res.status(201).json(parseItem(row))
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, subtitle, description, specs, variants, image_url, icon_name, sort_order } = req.body
  if (!name) { res.status(400).json({ message: 'Name is required' }); return }
  const result = db.prepare(
    'UPDATE marketing_items SET name=?, subtitle=?, description=?, specs=?, variants=?, image_url=?, icon_name=?, sort_order=? WHERE id=?'
  ).run(
    name,
    subtitle ?? null,
    description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    JSON.stringify(Array.isArray(variants) ? variants : []),
    image_url ?? null,
    icon_name ?? 'Package',
    sort_order ?? 0,
    req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM marketing_items WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseItem(row))
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM marketing_items WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

export default router
