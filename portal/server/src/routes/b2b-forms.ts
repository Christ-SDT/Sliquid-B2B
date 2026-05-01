import { Router } from 'express'
import { sendContactFormEmails, sendRetailerApplicationEmails, sendHPApplicationEmail } from '../email.js'

const router = Router()

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

export default router
