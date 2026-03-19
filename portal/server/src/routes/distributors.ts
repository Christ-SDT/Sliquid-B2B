import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

const COLS = 'id, name, region, state, city, address, contact_name, phone, email, website, notes'

router.get('/', requireAuth, (req, res) => {
  const { state, region, search } = req.query
  let sql = `SELECT ${COLS} FROM distributors WHERE 1=1`
  const params: any[] = []
  if (state)  { sql += ' AND state LIKE ?';  params.push(`%${state}%`) }
  if (region) { sql += ' AND region LIKE ?'; params.push(`%${region}%`) }
  if (search) {
    sql += ' AND (name LIKE ? OR city LIKE ? OR state LIKE ? OR address LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
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
  ).run(name, region, state ?? null, city ?? null, address ?? null, contact_name ?? null, phone ?? null, email ?? null, website ?? null, notes ?? null)
  res.status(201).json(db.prepare(`SELECT ${COLS} FROM distributors WHERE id = ?`).get(result.lastInsertRowid))
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { name, region, state, city, address, contact_name, phone, email, website, notes } = req.body
  if (!name || !region) { res.status(400).json({ message: 'name and region are required' }); return }
  const result = db.prepare(
    'UPDATE distributors SET name=?, region=?, state=?, city=?, address=?, contact_name=?, phone=?, email=?, website=?, notes=? WHERE id=?'
  ).run(name, region, state ?? null, city ?? null, address ?? null, contact_name ?? null, phone ?? null, email ?? null, website ?? null, notes ?? null, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare(`SELECT ${COLS} FROM distributors WHERE id = ?`).get(req.params.id))
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM distributors WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

export default router
