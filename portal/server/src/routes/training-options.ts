import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

function parseOption(row: Record<string, unknown>) {
  return {
    ...row,
    specs: JSON.parse((row.specs as string) || '[]'),
  }
}

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM training_options ORDER BY sort_order, id').all() as Record<string, unknown>[]
  res.json(rows.map(parseOption))
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, subtitle, description, specs, icon_name, sort_order } = req.body
  if (!label) { res.status(400).json({ message: 'label is required' }); return }
  const result = db.prepare(
    'INSERT INTO training_options (label, subtitle, description, specs, icon_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    label,
    subtitle ?? null,
    description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    icon_name ?? 'Users',
    sort_order ?? 0,
  )
  const row = db.prepare('SELECT * FROM training_options WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
  res.status(201).json(parseOption(row))
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { label, subtitle, description, specs, icon_name, sort_order } = req.body
  if (!label) { res.status(400).json({ message: 'label is required' }); return }
  const result = db.prepare(
    'UPDATE training_options SET label=?, subtitle=?, description=?, specs=?, icon_name=?, sort_order=? WHERE id=?'
  ).run(
    label,
    subtitle ?? null,
    description ?? null,
    JSON.stringify(Array.isArray(specs) ? specs : []),
    icon_name ?? 'Users',
    sort_order ?? 0,
    req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  const row = db.prepare('SELECT * FROM training_options WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseOption(row))
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM training_options WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

export default router
