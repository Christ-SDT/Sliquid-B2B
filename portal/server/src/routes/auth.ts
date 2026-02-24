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

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

export default router
