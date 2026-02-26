import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'
import { sendQuizPassEmail } from '../email.js'

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
