import emailjs from '@emailjs/nodejs'
import { db } from './database.js'

const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY
const SERVICE_ID = process.env.EMAILJS_SERVICE_ID

const configured = !!(PUBLIC_KEY && PRIVATE_KEY && SERVICE_ID)

const PORTAL_URL = process.env.PORTAL_URL ?? 'https://sliquid-portal.pages.dev'
const SUPPORT_EMAIL = 'support@sliquid.com'

async function sendEmail(templateId: string, params: Record<string, string>): Promise<void> {
  if (!configured) {
    console.log(`[email] EmailJS not configured — skipping template ${templateId}`)
    return
  }
  await emailjs.send(SERVICE_ID!, templateId, params, {
    publicKey: PUBLIC_KEY!,
    privateKey: PRIVATE_KEY!,
  })
}

// ─── Quiz pass ────────────────────────────────────────────────────────────────

export async function sendQuizPassEmail(opts: {
  toName: string
  toEmail: string
  quizTitle: string
  score: number
}): Promise<void> {
  const { toName, toEmail, quizTitle, score } = opts
  await sendEmail('portal_quiz_pass', {
    user_name: toName,
    quiz_title: quizTitle,
    score: String(score),
    portal_url: PORTAL_URL,
    to_email: toEmail,
  })
  console.log(`[email] Quiz pass email sent to ${toEmail} (${quizTitle}, ${score}%)`)
}

// ─── Certificate issued ────────────────────────────────────────────────────────

export async function sendCertificateEmail(opts: {
  toName: string
  toEmail: string
  certNumber: string
  completionDate: string
}): Promise<void> {
  const { toName, toEmail, certNumber, completionDate } = opts
  await sendEmail('portal_cert_issued', {
    user_name: toName,
    cert_number: certNumber,
    completion_date: completionDate,
    verify_url: `${PORTAL_URL}/verify`,
    to_email: toEmail,
  })
  console.log(`[email] Certificate email sent to ${toEmail} (${certNumber})`)
}

// ─── Registration ─────────────────────────────────────────────────────────────

export async function sendRegistrationConfirm(opts: {
  name: string
  email: string
  company: string
}): Promise<void> {
  const { name, email, company } = opts
  // User confirmation (template 4)
  await sendEmail('portal_register_confirm', {
    user_name: name,
    user_email: email,
    to_email: email,
  })
  // Admin notification (template 5)
  await sendEmail('portal_register_admin', {
    user_name: name,
    user_email: email,
    user_company: company,
  })
  console.log(`[email] Registration emails sent for ${email}`)
}

// ─── Approval / decline ───────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  tier1: 'Retail Store Employee',
  tier2: 'Retail Management',
  tier3: 'Distributor',
  tier4: 'Prospect',
  tier5: 'Admin',
}

export async function sendApprovalEmail(opts: {
  name: string
  email: string
  role: string
}): Promise<void> {
  const { name, email, role } = opts
  await sendEmail('portal_approved', {
    user_name: name,
    role_label: TIER_LABEL[role] ?? role,
    portal_url: PORTAL_URL,
    to_email: email,
  })
  console.log(`[email] Approval email sent to ${email} (${role})`)
}

export async function sendDeclineEmail(opts: {
  name: string
  email: string
}): Promise<void> {
  const { name, email } = opts
  await sendEmail('portal_declined', {
    user_name: name,
    support_email: SUPPORT_EMAIL,
    to_email: email,
  })
  console.log(`[email] Decline email sent to ${email}`)
}

// ─── Reward claim ─────────────────────────────────────────────────────────────

export async function sendRewardConfirmEmail(opts: {
  toName: string
  toEmail: string
  product: string
  shirtSize: string
  address: string
}): Promise<void> {
  const { toName, toEmail, product, shirtSize, address } = opts
  await sendEmail('portal_reward_confirm', {
    user_name: toName,
    product,
    shirt_size: shirtSize,
    address,
    to_email: toEmail,
  })
  console.log(`[email] Reward confirmation email sent to ${toEmail}`)
}

// ─── Marketing request ────────────────────────────────────────────────────────

export async function sendMarketingRequestEmails(opts: {
  name: string
  email: string
  company: string
  requestedItems: string
  notes: string
}): Promise<void> {
  const { name, email, company, requestedItems, notes } = opts
  // User confirmation (template 11)
  await sendEmail('portal_marketing_user', {
    user_name: name,
    requested_items: requestedItems,
    to_email: email,
  })
  // Admin notification (template 12)
  await sendEmail('portal_marketing_admin', {
    user_name: name,
    user_email: email,
    company,
    requested_items: requestedItems,
    notes: notes || '—',
  })
  console.log(`[email] Marketing request emails sent for ${email}`)
}

// ─── Asset broadcast ──────────────────────────────────────────────────────────

export async function sendBroadcastEmail(opts: {
  assetName: string
  brand: string
}): Promise<void> {
  if (!configured) {
    console.log('[email] EmailJS not configured — skipping broadcast email:', opts.assetName)
    return
  }

  const users = db
    .prepare(
      `SELECT name, email FROM users WHERE role NOT IN ('tier5', 'admin') AND status = 'active'`,
    )
    .all() as { name: string; email: string }[]

  for (const u of users) {
    await sendEmail('portal_asset_broadcast', {
      user_name: u.name,
      asset_name: opts.assetName,
      brand: opts.brand,
      portal_url: PORTAL_URL,
      to_email: u.email,
    }).catch((err) => console.error(`[email] Broadcast failed for ${u.email}:`, err))
  }

  console.log(`[email] Asset broadcast sent to ${users.length} users (${opts.assetName})`)
}
