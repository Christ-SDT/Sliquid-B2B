import { Router } from 'express'
import { sendContactFormEmails, sendRetailerApplicationEmails, sendHPApplicationEmail } from '../email.js'

const router = Router()

// ─── Mailchimp helper ─────────────────────────────────────────────────────────

const MAILCHIMP_LIST_ID = '88a27ac60c'

async function addToMailchimp(data: {
  email: string
  name: string
  businessName: string
  businessType: string
  storeNames?: string
  storeCount?: string
  contactName: string
}): Promise<void> {
  const apiKey = process.env.MAILCHIMP_API_KEY
  if (!apiKey) { console.warn('[mailchimp] MAILCHIMP_API_KEY not set — skipping'); return }

  const dc = apiKey.split('-').pop()
  if (!dc) throw new Error('Invalid Mailchimp API key format')

  const nameParts = data.name.trim().split(' ')
  const firstName = nameParts[0] ?? ''
  const lastName  = nameParts.slice(1).join(' ') || '-'

  const tags = ['Erospain 2026', data.businessType]

  const body: Record<string, unknown> = {
    email_address: data.email,
    status: 'pending',  // triggers Mailchimp double opt-in confirmation email
    merge_fields: {
      FNAME:    firstName,
      LNAME:    lastName,
      COMPANY:  data.businessName,
      PHONE:    data.contactName,
    },
    tags,
    marketing_permissions: [],
  }

  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string; title?: string }
    // 400 with "Member Exists" is fine — already subscribed
    if ((err as any).title === 'Member Exists') { console.log(`[mailchimp] ${data.email} already in list`); return }
    throw new Error(err.detail ?? `Mailchimp error ${res.status}`)
  }

  console.log(`[mailchimp] Added ${data.email} as pending (double opt-in sent)`)
}

// ─── POST /api/b2b/contact ────────────────────────────────────────────────────

router.post('/contact', async (req, res) => {
  const { fromName, fromEmail, company, phone, subject, message } = req.body

  if (!fromName || !fromEmail || !subject || !message) {
    res.status(400).json({ message: 'Missing required fields.' })
    return
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(fromEmail)) {
    res.status(400).json({ message: 'Invalid email address.' })
    return
  }

  try {
    await sendContactFormEmails({ fromName, fromEmail, company: company || '', phone: phone || '', subject, message })
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[b2b-forms] Contact error:', err)
    res.status(500).json({ message: 'Failed to send message. Please try again.' })
  }
})

// ─── POST /api/b2b/retailer-apply ─────────────────────────────────────────────
// Public — called by the main B2B site, no auth required

router.post('/retailer-apply', async (req, res) => {
  const { company, contactName, address, phone, email, website, brands, storeLocator, comments } = req.body

  if (!company || !contactName || !email || !phone || !brands) {
    res.status(400).json({ message: 'Missing required fields.' })
    return
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    res.status(400).json({ message: 'Invalid email address.' })
    return
  }

  try {
    await sendRetailerApplicationEmails({
      company, contactName, address: address || '', phone, email,
      website: website || 'N/A', brands,
      storeLocator: storeLocator || 'No',
      comments: comments || 'N/A',
    })
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[b2b-forms] Retailer apply error:', err)
    res.status(500).json({ message: 'Failed to send application. Please try again.' })
  }
})

// ─── POST /api/b2b/hp-apply ───────────────────────────────────────────────────
// Public — called by the main B2B site, no auth required

router.post('/hp-apply', async (req, res) => {
  const {
    practiceType, practiceName, practiceAddress, practicePhone,
    practiceWebsite, contactName, relationship, email,
    contactPhone, preferredContact, addToDirectory,
  } = req.body

  if (!practiceType || !practiceName || !email || !contactName || !contactPhone) {
    res.status(400).json({ message: 'Missing required fields.' })
    return
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    res.status(400).json({ message: 'Invalid email address.' })
    return
  }

  try {
    await sendHPApplicationEmail({
      practiceType, practiceName,
      practiceAddress: practiceAddress || '',
      practicePhone, practiceWebsite: practiceWebsite || '',
      contactName, relationship: relationship || '',
      email, contactPhone,
      preferredContact: preferredContact || 'Email',
      addToDirectory: addToDirectory || 'No',
    })
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[b2b-forms] HP apply error:', err)
    res.status(500).json({ message: 'Failed to send application. Please try again.' })
  }
})

// ─── POST /api/b2b/booth-signup ───────────────────────────────────────────────
// Hidden booth intake form — Erospain 2026. No auth, public CORS.

router.post('/booth-signup', async (req, res) => {
  const { name, email, businessName, businessType, storeNames, storeCount, contactName } = req.body

  if (!name || !email || !businessName || !businessType || !contactName) {
    res.status(400).json({ message: 'Missing required fields.' })
    return
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    res.status(400).json({ message: 'Invalid email address.' })
    return
  }

  try {
    await addToMailchimp({ email, name, businessName, businessType, storeNames, storeCount, contactName })
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[b2b-forms] Booth signup error:', err)
    res.status(500).json({ message: err.message ?? 'Failed to submit. Please try again.' })
  }
})

export default router
