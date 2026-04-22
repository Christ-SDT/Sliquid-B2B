import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'
import { sendRewardConfirmEmail, sendRewardAdminEmail } from '../email.js'
import { notifyAdmins } from '../notifications.js'

const router = Router()

// GET /api/certificates/mine — authenticated user's certificate
router.get('/mine', requireAuth, (req, res) => {
  const user = req.user!
  const cert = db.prepare(
    'SELECT * FROM certificates WHERE user_id = ? AND is_valid = 1'
  ).get(user.id) as { certificate_number: string; completion_date: string } | undefined

  if (!cert) {
    res.status(404).json({ message: 'No certificate found' })
    return
  }

  const parts = user.name.trim().split(' ')
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  const date = new Date(cert.completion_date)
  const completionDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const reward = db.prepare('SELECT id FROM cert_rewards WHERE user_id = ?').get(user.id)

  res.json({
    firstName,
    lastName,
    completionDate,
    certificateNumber: cert.certificate_number,
    rewardSubmitted: !!reward,
  })
})

// POST /api/certificates/reward — save reward claim (one per user)
router.post('/reward', requireAuth, (req, res) => {
  const user = req.user!
  const { product, shirtSize, address1, address2, city, state, zip } = req.body as {
    product?: string
    shirtSize?: string
    address1?: string
    address2?: string
    city?: string
    state?: string
    zip?: string
  }

  if (!product?.trim() || !shirtSize || !address1?.trim() || !city?.trim() || !state?.trim() || !zip?.trim()) {
    res.status(400).json({ message: 'All required fields must be filled in' })
    return
  }

  const cert = db.prepare('SELECT id, certificate_number FROM certificates WHERE user_id = ? AND is_valid = 1').get(user.id) as { id: number; certificate_number: string } | undefined
  if (!cert) {
    res.status(403).json({ message: 'No valid certificate found' })
    return
  }

  const existing = db.prepare('SELECT id FROM cert_rewards WHERE user_id = ?').get(user.id)
  if (existing) {
    res.json({ message: 'Already submitted' })
    return
  }

  db.prepare(
    'INSERT INTO cert_rewards (user_id, full_name, product, shirt_size, address1, address2, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    user.id,
    user.name,
    product.trim(),
    shirtSize,
    address1.trim(),
    address2?.trim() || null,
    city.trim(),
    state.trim(),
    zip.trim()
  )

  const addressStr = [address1.trim(), address2?.trim(), city.trim(), state.trim(), zip.trim()]
    .filter(Boolean).join(', ')
  sendRewardConfirmEmail({
    toName: user.name,
    toEmail: user.email,
    product: product.trim(),
    shirtSize,
    address: addressStr,
  }).catch(err => console.error('[email] Reward confirm email failed:', err))

  // Look up average quiz score across all passed results for this user
  const scoreRow = db.prepare(
    `SELECT ROUND(AVG(score)) as avg_score FROM quiz_results WHERE user_id = ? AND passed = 1`
  ).get(user.id) as { avg_score: number | null }
  const avgScore = scoreRow?.avg_score ?? 0

  sendRewardAdminEmail({
    userName: user.name,
    userEmail: user.email,
    certNumber: cert.certificate_number,
    avgScore,
    product: product.trim(),
    shirtSize,
    address: addressStr,
  }).catch(err => console.error('[email] Reward admin email failed:', err))

  notifyAdmins(
    'reward_claim',
    'Reward Claim Submitted',
    `${user.name} — Product: ${product.trim()} | Shirt: ${shirtSize} | Cert: ${cert.certificate_number} | Avg Score: ${avgScore}%`,
    '/users'
  )

  res.status(201).json({ message: 'Submitted successfully' })
})

// GET /api/certificates/rewards — admin: list all reward claims with user + cert info
router.get('/rewards', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      cr.id,
      cr.full_name,
      cr.product,
      cr.shirt_size,
      cr.address1,
      cr.address2,
      cr.city,
      cr.state,
      cr.zip,
      cr.submitted_at,
      cr.fulfilled,
      cr.fulfilled_at,
      u.email,
      c.certificate_number,
      ROUND(AVG(qr.score)) as avg_score
    FROM cert_rewards cr
    JOIN users u ON u.id = cr.user_id
    JOIN certificates c ON c.user_id = cr.user_id AND c.is_valid = 1
    LEFT JOIN quiz_results qr ON qr.user_id = cr.user_id AND qr.passed = 1
    GROUP BY cr.id
    ORDER BY cr.fulfilled ASC, cr.submitted_at DESC
  `).all()
  res.json(rows)
})

// PUT /api/certificates/rewards/:id/fulfilled — toggle fulfilled status
router.put('/rewards/:id/fulfilled', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const { fulfilled } = req.body as { fulfilled: boolean }
  db.prepare(`
    UPDATE cert_rewards
    SET fulfilled = ?, fulfilled_at = ?
    WHERE id = ?
  `).run(fulfilled ? 1 : 0, fulfilled ? new Date().toISOString() : null, id)
  res.json({ ok: true })
})

// GET /api/certificates/verify/:certNumber — public, no auth required
router.get('/verify/:certNumber', (req, res) => {
  const row = db.prepare(`
    SELECT c.certificate_number, c.issued_to, c.completion_date, c.is_valid
    FROM certificates c
    WHERE c.certificate_number = ?
  `).get(req.params.certNumber) as {
    certificate_number: string
    issued_to: string
    completion_date: string
    is_valid: number
  } | undefined

  if (!row || !row.is_valid) {
    res.status(404).json({ valid: false, message: 'Certificate not found' })
    return
  }

  const parts = row.issued_to.trim().split(' ')
  const date = new Date(row.completion_date)
  res.json({
    valid: true,
    fullName: row.issued_to,
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    completionDate: date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    certificateNumber: row.certificate_number,
  })
})

export default router
