import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import rateLimit from 'express-rate-limit'
import { db } from '../database.js'
import { requireAuth, JWT_SECRET } from '../middleware/auth.js'
import { sendRegistrationConfirm, sendPasswordResetEmail } from '../email.js'
import { notifyAdmins } from '../notifications.js'

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

  if (user.status === 'declined') {
    res.status(403).json({ message: 'Your registration request was declined. Please contact support@sliquid.com.' })
    return
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id)

  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company, status: user.status },
  })
})

router.post('/register', loginLimiter, async (req, res) => {
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
  const role = 'tier4'
  const status = 'pending'
  const password_hash = await bcrypt.hash(password, 10)
  const result = db.prepare(
    'INSERT INTO users (name, email, company, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, email, company, password_hash, role, status)
  const userId = result.lastInsertRowid as number
  const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' })

  sendRegistrationConfirm({ name, email, company })
    .catch(err => console.error('[email] Registration email failed:', err))

  notifyAdmins(
    'new_registration',
    'New Partner Request',
    `${name} (${company}) has submitted a registration request.`,
    '/requests',
  )

  res.status(201).json({
    token,
    user: { id: userId, name, email, role, company },
  })
})

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user)
})

// ─── Forgot password ──────────────────────────────────────────────────────────

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again in 15 minutes.' },
})

router.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body
  if (!email) { res.status(400).json({ message: 'Email is required' }); return }

  // Always return 200 to prevent email enumeration
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email) as { id: number; name: string } | undefined
  if (!user) { res.json({ ok: true }); return }

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id)

  const RESET_BASE = process.env.B2B_SITE_URL ?? process.env.PORTAL_URL ?? 'https://sliquid-portal.pages.dev'
  const resetUrl = `${RESET_BASE}/reset-password?token=${token}`

  sendPasswordResetEmail({ toName: user.name, toEmail: email, resetUrl })
    .catch(err => console.error('[email] Password reset email failed:', err))

  res.json({ ok: true })
})

// ─── Reset password ───────────────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password) { res.status(400).json({ message: 'Token and password are required' }); return }
  if (password.length < 8) { res.status(400).json({ message: 'Password must be at least 8 characters' }); return }

  const user = db.prepare('SELECT id, reset_token_expires FROM users WHERE reset_token = ?').get(token) as { id: number; reset_token_expires: string } | undefined
  if (!user) { res.status(400).json({ message: 'Invalid or expired reset link' }); return }

  if (new Date(user.reset_token_expires) < new Date()) {
    db.prepare('UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(user.id)
    res.status(400).json({ message: 'Reset link has expired. Please request a new one.' }); return
  }

  const password_hash = await bcrypt.hash(password, 10)
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(password_hash, user.id)

  res.json({ ok: true })
})

export default router
