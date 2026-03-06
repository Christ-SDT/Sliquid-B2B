import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

const SELECT_COLS = 'id, quiz_id, title, description, video_path, passing_score, estimated_minutes, sort_order'

router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare(`SELECT ${SELECT_COLS} FROM trainings ORDER BY sort_order, id`).all()
  res.json(rows)
})

router.post('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { quiz_id, title, description, video_path, passing_score, estimated_minutes, sort_order } = req.body
  if (!quiz_id || !title) { res.status(400).json({ message: 'quiz_id and title are required' }); return }
  const result = db.prepare(
    'INSERT INTO trainings (quiz_id, title, description, video_path, passing_score, estimated_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    quiz_id,
    title,
    description ?? null,
    video_path ?? null,
    passing_score ?? 70,
    estimated_minutes ?? 15,
    sort_order ?? 0,
  )
  res.status(201).json(db.prepare(`SELECT ${SELECT_COLS} FROM trainings WHERE id = ?`).get(result.lastInsertRowid))
})

router.put('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { quiz_id, title, description, video_path, passing_score, estimated_minutes, sort_order } = req.body
  if (!quiz_id || !title) { res.status(400).json({ message: 'quiz_id and title are required' }); return }
  const result = db.prepare(
    'UPDATE trainings SET quiz_id=?, title=?, description=?, video_path=?, passing_score=?, estimated_minutes=?, sort_order=? WHERE id=?'
  ).run(
    quiz_id,
    title,
    description ?? null,
    video_path ?? null,
    passing_score ?? 70,
    estimated_minutes ?? 15,
    sort_order ?? 0,
    req.params.id,
  )
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare(`SELECT ${SELECT_COLS} FROM trainings WHERE id = ?`).get(req.params.id))
})

router.delete('/:id', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM trainings WHERE id = ?').run(req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json({ ok: true })
})

export default router
