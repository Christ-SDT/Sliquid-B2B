import { Router } from 'express'
import { randomBytes } from 'crypto'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { sendRewardConfirmEmail, sendRewardAdminEmail } from '../email.js'
import { notifyAdmins } from '../notifications.js'
import {
  getRewardOptions,
  deriveRewardProducts,
  getAllowedSkus,
  setAllowedSkus,
  getShirtSizes,
  setShirtSizes,
  DEFAULT_SHIRT_SIZES,
} from '../rewardOptions.js'

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
router.get('/rewards', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
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

// PUT /api/certificates/rewards/:id/fulfilled — toggle "items sent" status.
// Shared by the Marketing Requests page and the per-user switch in User Management,
// so it returns the stored row: the caller must not have to guess the timestamp.
router.put('/rewards/:id/fulfilled', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const { fulfilled } = req.body as { fulfilled: boolean }
  const exists = db.prepare('SELECT id FROM cert_rewards WHERE id = ?').get(id)
  if (!exists) { res.status(404).json({ message: 'Reward claim not found' }); return }

  const sentAt = fulfilled ? new Date().toISOString() : null
  db.prepare(`
    UPDATE cert_rewards
    SET fulfilled = ?, fulfilled_at = ?
    WHERE id = ?
  `).run(fulfilled ? 1 : 0, sentAt, id)
  res.json({ ok: true, id, fulfilled: fulfilled ? 1 : 0, fulfilled_at: sentAt })
})

// GET /api/certificates/reward-options — what the reward form renders.
// Any authenticated user: the picker itself is part of the partner flow.
router.get('/reward-options', requireAuth, (_req, res) => {
  res.json(getRewardOptions())
})

// GET /api/certificates/reward-options/all — admin editor payload.
// Returns the FULL derived catalog plus the current selection, so the admin can
// tick items on and off. `allowedSkus: null` means "no curation saved yet",
// which the client renders as everything-selected.
router.get('/reward-options/all', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  res.json({
    products: deriveRewardProducts(),
    allowedSkus: getAllowedSkus(),
    shirtSizes: getShirtSizes(),
    defaultShirtSizes: DEFAULT_SHIRT_SIZES,
  })
})

// PUT /api/certificates/reward-options — save admin curation.
// Both fields are independently optional so the two editors can save separately.
router.put('/reward-options', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { products, shirtSizes } = req.body as { products?: unknown; shirtSizes?: unknown }

  if (products !== undefined) {
    if (!Array.isArray(products) || products.some(p => typeof p !== 'string')) {
      res.status(400).json({ message: 'products must be an array of SKU strings' })
      return
    }
    setAllowedSkus(products as string[])
  }

  if (shirtSizes !== undefined) {
    if (!Array.isArray(shirtSizes) || shirtSizes.some(s => typeof s !== 'string')) {
      res.status(400).json({ message: 'shirtSizes must be an array of strings' })
      return
    }
    const cleaned = (shirtSizes as string[]).map(s => s.trim()).filter(Boolean)
    if (cleaned.length === 0) {
      res.status(400).json({ message: 'At least one shirt size is required' })
      return
    }
    setShirtSizes(cleaned)
  }

  res.json({ ok: true, ...getRewardOptions() })
})

// POST /api/certificates/test/ensure — admin only, self-scoped.
// Issues a certificate for the CALLING admin if they don't already have one, so the
// reward prompt + certificate download can be exercised without passing all 11 quizzes.
// Non-destructive: an existing certificate (real or test) is returned untouched.
router.post('/test/ensure', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const user = req.user!

  const existing = db.prepare(
    'SELECT certificate_number FROM certificates WHERE user_id = ? AND is_valid = 1'
  ).get(user.id) as { certificate_number: string } | undefined

  if (existing) {
    res.json({ certificateNumber: existing.certificate_number, created: false })
    return
  }

  const suffix = randomBytes(3).toString('hex').toUpperCase()
  const certNumber = `SLQ-${new Date().getFullYear()}-${suffix}`
  db.prepare(
    'INSERT INTO certificates (certificate_number, user_id, issued_to) VALUES (?, ?, ?)'
  ).run(certNumber, user.id, user.name)

  res.status(201).json({ certificateNumber: certNumber, created: true })
})

// POST /api/certificates/test/reset — admin only, self-scoped.
// Clears the CALLING admin's own cert_rewards row so the reward prompt appears again.
// Deliberately does NOT touch the certificates table: the certificate number stays
// stable, so a genuinely-earned certificate can never be destroyed by a test reset.
router.post('/test/reset', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const user = req.user!
  const result = db.prepare('DELETE FROM cert_rewards WHERE user_id = ?').run(user.id)
  res.json({ ok: true, deleted: result.changes })
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
