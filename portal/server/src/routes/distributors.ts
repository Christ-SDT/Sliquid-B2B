import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

const COLS = 'id, name, region, state, city, address, contact_name, phone, email, website, notes'

/**
 * `distributors.state` is `TEXT NOT NULL` (migration v1) but is an OPTIONAL field
 * everywhere else: only `name` + `region` are validated here, and the admin form
 * marks only those two required — it sends `state: state || null` when the field
 * is left blank. Passing that null straight through raised a NOT NULL constraint
 * violation and 500'd on a request that was perfectly valid by the route's own
 * contract.
 *
 * Coerced to '' rather than made required, because the contract says optional and
 * the column cannot be relaxed without a table rebuild (migrations are additive
 * only). `state` is a display string ("CO, MI, AZ"), so '' renders as no listed
 * locations — which is exactly what "left blank" means.
 */
function stateValue(state: unknown): string {
  return typeof state === 'string' ? state.trim() : ''
}

router.get('/', requireAuth, (req, res) => {
  const { state, region, search } = req.query
  let sql = `SELECT ${COLS} FROM distributors WHERE 1=1`
  const params: any[] = []
  if (state)  { sql += ' AND state LIKE ?';  params.push(`%${state}%`) }
  if (region) { sql += ' AND region LIKE ?'; params.push(`%${region}%`) }
  if (search) {
    sql += ' AND (name LIKE ? OR city LIKE ? OR state LIKE ? OR address LIKE ? OR region LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  sql += ' ORDER BY name'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', requireAuth, (req, res) => {
  const dist = db.prepare(`SELECT ${COLS} FROM distributors WHERE id = ?`).get(req.params.id)
  if (!dist) { res.status(404).json({ message: 'Not found' }); return }
  res.json(dist)
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, region, state, city, address, contact_name, phone, email, website, notes } = req.body
  if (!name || !region) { res.status(400).json({ message: 'name and region are required' }); return }
  const result = db.prepare(
    'INSERT INTO distributors (name, region, state, city, address, contact_name, phone, email, website, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, region, stateValue(state), city ?? null, address ?? null, contact_name ?? null, phone ?? null, email ?? null, website ?? null, notes ?? null)
  res.status(201).json(db.prepare(`SELECT ${COLS} FROM distributors WHERE id = ?`).get(result.lastInsertRowid))
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, region, state, city, address, contact_name, phone, email, website, notes } = req.body
  if (!name || !region) { res.status(400).json({ message: 'name and region are required' }); return }
  const result = db.prepare(
    'UPDATE distributors SET name=?, region=?, state=?, city=?, address=?, contact_name=?, phone=?, email=?, website=?, notes=? WHERE id=?'
  ).run(name, region, stateValue(state), city ?? null, address ?? null, contact_name ?? null, phone ?? null, email ?? null, website ?? null, notes ?? null, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare(`SELECT ${COLS} FROM distributors WHERE id = ?`).get(req.params.id))
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM distributors WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

export default router
