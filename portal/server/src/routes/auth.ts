import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '../database.js'
import { requireAuth, JWT_SECRET } from '../middleware/auth.js'

const router = Router()

router.post('/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password required' })
    return
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
  if (!user) { res.status(401).json({ message: 'Invalid credentials' }); return }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) { res.status(401).json({ message: 'Invalid credentials' }); return }

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company },
  })
})

router.post('/register', async (req, res) => {
  const { name, email, company, password } = req.body
  if (!name || !email || !company || !password) {
    res.status(400).json({ message: 'All fields are required' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters' })
    return
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ message: 'Email already in use' })
    return
  }
  const password_hash = await bcrypt.hash(password, 10)
  const result = db.prepare(
    'INSERT INTO users (name, email, company, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, company, password_hash, 'tier1')
  const userId = result.lastInsertRowid as number
  const token = jwt.sign({ userId, role: 'tier1' }, JWT_SECRET, { expiresIn: '7d' })
  res.status(201).json({
    token,
    user: { id: userId, name, email, role: 'tier1', company },
  })
})

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

export default router
