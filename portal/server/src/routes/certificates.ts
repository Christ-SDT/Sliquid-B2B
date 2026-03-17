import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

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

  res.json({ firstName, lastName, completionDate, certificateNumber: cert.certificate_number })
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
