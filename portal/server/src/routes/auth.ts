import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { db } from '../database.js'
import { requireAuth, JWT_SECRET } from '../middleware/auth.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
})

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password required' })
    return
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
  if (!user) { res.status(401).json({ message: 'Invalid credentials' }); return }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) { res.status(401).json({ message: 'Invalid credentials' }); return }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id)

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company },
  })
})

router.post('/register', loginLimiter, async (req, res) => {
  const { name, email, company, password, role: requestedRole } = req.body
  if (!name || !email || !company || !password) {
    res.status(400).json({ message: 'All fields are required' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters' })
    return
  }
  const validRoles = ['tier1', 'tier2', 'tier3', 'tier4']
  const role = validRoles.includes(requestedRole) ? requestedRole : 'tier1'
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ message: 'Email already in use' })
    return
  }
  const password_hash = await bcrypt.hash(password, 10)
  const result = db.prepare(
    'INSERT INTO users (name, email, company, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, company, password_hash, role)
  const userId = result.lastInsertRowid as number
  const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' })
  res.status(201).json({
    token,
    user: { id: userId, name, email, role, company },
  })
})

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

export default router
