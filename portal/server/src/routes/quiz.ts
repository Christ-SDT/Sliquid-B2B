import { Router } from 'express'
import { randomBytes } from 'crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'
import { sendQuizPassEmail, sendCertificateEmail } from '../email.js'

const router = Router()

// POST /api/quiz/complete
// Body: { quizId: string, quizTitle: string, score: number }
router.post('/complete', requireAuth, (req, res) => {
  const user = req.user!
  const { quizId, quizTitle, score } = req.body as {
    quizId: string
    quizTitle: string
    score: number
  }

  if (!quizId || score == null || typeof score !== 'number') {
    res.status(400).json({ message: 'quizId and numeric score are required' })
    return
  }

  const clampedScore = Math.max(0, Math.min(100, score))
  const passed = clampedScore >= 70 ? 1 : 0

  db.prepare(`
    INSERT INTO quiz_results (user_id, quiz_id, score, passed)
    VALUES (?, ?, ?, ?)
  `).run(user.id, quizId, clampedScore, passed)

  if (passed) {
    sendQuizPassEmail({
      toName: user.name,
      toEmail: user.email,
      quizTitle: quizTitle ?? quizId,
      score: clampedScore,
    }).catch(err => console.error('[email] Failed to send pass email:', err))

    // Check if all trainings have been passed → auto-issue certificate
    const allIds = (db.prepare('SELECT quiz_id FROM trainings').all() as { quiz_id: string }[])
      .map(r => r.quiz_id)

    if (allIds.length > 0) {
      const passedIds = (db.prepare(
        `SELECT DISTINCT quiz_id FROM quiz_results WHERE user_id = ? AND passed = 1`
      ).all(user.id) as { quiz_id: string }[]).map(r => r.quiz_id)

      const allPassed = allIds.every(id => passedIds.includes(id))

      if (allPassed) {
        const existing = db.prepare('SELECT id FROM certificates WHERE user_id = ?').get(user.id)
        if (!existing) {
          const suffix = randomBytes(3).toString('hex').toUpperCase()
          const certNumber = `SLQ-${new Date().getFullYear()}-${suffix}`
          db.prepare(
            'INSERT INTO certificates (certificate_number, user_id, issued_to) VALUES (?, ?, ?)'
          ).run(certNumber, user.id, user.name)
          console.log(`[cert] Issued certificate ${certNumber} to user ${user.id} (${user.name})`)
          const completionDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          })
          sendCertificateEmail({
            toName: user.name,
            toEmail: user.email,
            certNumber,
            completionDate,
          }).catch(err => console.error('[email] Certificate email failed:', err))
        }
      }
    }
  }

  res.json({ ok: true, score: clampedScore, passed: !!passed })
})

// GET /api/quiz/results — current user's own history
router.get('/results', requireAuth, (req, res) => {
  const user = req.user!
  const results = db.prepare(`
    SELECT id, quiz_id, score, passed, completed_at
    FROM quiz_results
    WHERE user_id = ?
    ORDER BY completed_at DESC
  `).all(user.id)
  res.json(results)
})

export default router
