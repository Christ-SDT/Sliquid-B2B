import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { sendEmail } from '../email.js'

const router = Router()

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── Mailchimp helpers ────────────────────────────────────────────────────────

function getMailchimpBase() {
  const apiKey = process.env.MAILCHIMP_API_KEY
  if (!apiKey) return null
  const dc = apiKey.split('-').pop()
  return { apiKey, dc, base: `https://${dc}.api.mailchimp.com/3.0` }
}

function mailchimpAuth(apiKey: string) {
  return `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`
}

async function getMailchimpMember(listId: string, email: string) {
  const mc = getMailchimpBase()
  if (!mc) return null
  const hash = (await import('crypto')).createHash('md5').update(email.toLowerCase()).digest('hex')
  const res = await fetch(`${mc.base}/lists/${listId}/members/${hash}`, {
    headers: { Authorization: mailchimpAuth(mc.apiKey) },
  })
  if (!res.ok) return null
  return res.json()
}

async function deleteMailchimpMember(listId: string, email: string): Promise<boolean> {
  const mc = getMailchimpBase()
  if (!mc) return false
  const hash = (await import('crypto')).createHash('md5').update(email.toLowerCase()).digest('hex')
  const res = await fetch(`${mc.base}/lists/${listId}/members/${hash}/actions/delete-permanent`, {
    method: 'POST',
    headers: { Authorization: mailchimpAuth(mc.apiKey) },
  })
  return res.ok || res.status === 204 || res.status === 404
}

// ─── POST /api/gdpr/request ───────────────────────────────────────────────────
// Public — no auth. Submits an access or deletion request and stores it in DB.

router.post('/request', (req, res) => {
  const { type, name, email, message } = req.body

  if (!type || !['access', 'deletion'].includes(type)) {
    res.status(400).json({ message: 'type must be "access" or "deletion".' }); return
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ message: 'name is required.' }); return
  }
  if (!email || !emailRe.test(email)) {
    res.status(400).json({ message: 'A valid email address is required.' }); return
  }

  db.prepare(`
    INSERT INTO gdpr_requests (type, name, email, message)
    VALUES (?, ?, ?, ?)
  `).run(type, name.trim(), email.trim().toLowerCase(), message?.trim() || null)

  res.status(201).json({ ok: true })
})

// ─── GET /api/gdpr/requests ───────────────────────────────────────────────────
// Admin only — list all GDPR requests, newest first.

router.get('/requests', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { status, type } = req.query
  let sql = 'SELECT * FROM gdpr_requests WHERE 1=1'
  const params: any[] = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (type)   { sql += ' AND type = ?';   params.push(type) }
  sql += ' ORDER BY submitted_at DESC'
  res.json(db.prepare(sql).all(...params))
})

// ─── PUT /api/gdpr/requests/:id/status ───────────────────────────────────────
// Admin only — update request status.

router.put('/requests/:id/status', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { status } = req.body
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    res.status(400).json({ message: 'Invalid status.' }); return
  }
  const completedAt = status === 'completed' ? "datetime('now')" : 'NULL'
  const result = db.prepare(`
    UPDATE gdpr_requests
    SET status = ?, completed_at = ${completedAt === 'NULL' ? 'NULL' : "(datetime('now'))"}
    WHERE id = ?
  `).run(status, req.params.id)
  if (result.changes === 0) { res.status(404).json({ message: 'Not found' }); return }
  res.json(db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id))
})

// ─── POST /api/gdpr/requests/:id/send-data ───────────────────────────────────
// Admin only — pull all data held for the requester's email and email it to them.

router.post('/requests/:id/send-data', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const request = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id) as any
  if (!request) { res.status(404).json({ message: 'Request not found' }); return }

  const email = request.email as string
  const MAILCHIMP_LIST_ID = '88a27ac60c'

  // Collect all DB data for this email
  const user        = db.prepare('SELECT id, name, email, company, role, created_at, last_login FROM users WHERE email = ?').get(email) as any
  const quizResults = user ? db.prepare('SELECT quiz_id, score, passed, completed_at FROM quiz_results WHERE user_id = ?').all(user.id) : []
  const certificate = user ? db.prepare('SELECT certificate_number, completion_date, is_valid FROM certificates WHERE user_id = ?').get(user.id) : null
  const applications = db.prepare("SELECT business_name, contact_name, email, created_at FROM retailer_applications WHERE email = ?").all(email) as any[]
  const gdprHistory = db.prepare('SELECT type, submitted_at, status FROM gdpr_requests WHERE email = ?').all(email) as any[]

  // Collect Mailchimp data
  let mailchimpData: any = null
  try { mailchimpData = await getMailchimpMember(MAILCHIMP_LIST_ID, email) } catch { /* skip if not configured */ }

  // Build readable data summary
  const lines: string[] = [
    `GDPR Data Export for: ${email}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== PORTAL ACCOUNT ===',
    user
      ? `Name: ${user.name}\nEmail: ${user.email}\nCompany: ${user.company}\nRole: ${user.role}\nJoined: ${user.created_at}\nLast Login: ${user.last_login ?? 'Never'}`
      : 'No portal account found for this email.',
    '',
    '=== TRAINING RESULTS ===',
    quizResults.length
      ? (quizResults as any[]).map((q: any) => `${q.quiz_id}: ${q.score}% — ${q.passed ? 'Passed' : 'Failed'} (${q.completed_at})`).join('\n')
      : 'None',
    '',
    '=== CERTIFICATE ===',
    certificate
      ? `Number: ${(certificate as any).certificate_number}\nCompleted: ${(certificate as any).completion_date}\nValid: ${(certificate as any).is_valid ? 'Yes' : 'No'}`
      : 'None',
    '',
    '=== APPLICATIONS SUBMITTED ===',
    applications.length
      ? applications.map((a: any) => `Business: ${a.business_name} — Contact: ${a.contact_name} — Submitted: ${a.created_at}`).join('\n')
      : 'None',
    '',
    '=== GDPR REQUEST HISTORY ===',
    gdprHistory.map((g: any) => `${g.type} request — ${g.status} — ${g.submitted_at}`).join('\n'),
    '',
    '=== MAILCHIMP ===',
    mailchimpData
      ? `Status: ${mailchimpData.status}\nSubscribed: ${mailchimpData.timestamp_opt ?? 'N/A'}\nTags: ${mailchimpData.tags?.map((t: any) => t.name).join(', ') || 'None'}`
      : 'Not found in Mailchimp audience or Mailchimp not configured.',
  ]

  const dataSummary = lines.join('\n')

  // Send to the requester via EmailJS
  const sent = await sendEmail('b2b_gdpr_data_export', {
    to_email:     email,
    to_name:      request.name,
    data_summary: dataSummary,
  })

  if (!sent) {
    // EmailJS not configured — return data to admin to send manually
    res.json({ ok: true, emailSent: false, dataSummary })
    return
  }

  // Mark as completed
  db.prepare("UPDATE gdpr_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(request.id)
  res.json({ ok: true, emailSent: true })
})

// ─── POST /api/gdpr/requests/:id/delete-data ─────────────────────────────────
// Admin only — permanently delete the requester's data from Mailchimp and DB.

router.post('/requests/:id/delete-data', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const request = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id) as any
  if (!request) { res.status(404).json({ message: 'Request not found' }); return }

  const email = request.email as string
  const MAILCHIMP_LIST_ID = '88a27ac60c'
  const results: Record<string, string> = {}

  // 1. Delete from Mailchimp
  try {
    const deleted = await deleteMailchimpMember(MAILCHIMP_LIST_ID, email)
    results.mailchimp = deleted ? 'Deleted' : 'Not found or Mailchimp not configured'
  } catch (err: any) {
    results.mailchimp = `Error: ${err.message}`
  }

  // 2. Anonymize portal user account (keep row for relational integrity but wipe PII)
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any
  if (user) {
    db.prepare(`
      UPDATE users SET
        name  = '[deleted]',
        email = 'deleted-${user.id}@deleted.invalid',
        company = '[deleted]',
        reset_token = NULL,
        reset_token_expires = NULL
      WHERE id = ?
    `).run(user.id)
    results.portalAccount = 'Anonymized'
  } else {
    results.portalAccount = 'No account found'
  }

  // 3. Mark this GDPR request as completed
  db.prepare("UPDATE gdpr_requests SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(request.id)

  res.json({ ok: true, results })
})

export default router
