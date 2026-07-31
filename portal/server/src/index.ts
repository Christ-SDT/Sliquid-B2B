import 'dotenv/config'
import { app } from './app.js'
import { woo, runWooSync } from './woocommerce.js'
import { wp, runAnnouncementSync } from './wordpress.js'
import { sweepScheduledAnnouncements } from './announcements.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.listen(PORT, () => {
  console.log(`Portal server running on http://localhost:${PORT}`)

  // Startup env diagnostics — helps debug missing Railway variables
  const emailVars = ['EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY', 'EMAILJS_SERVICE_ID']
  const missing = emailVars.filter(k => !process.env[k])
  if (missing.length === 0) {
    console.log('[email] ✓ All EmailJS env vars present')
  } else {
    console.warn('[email] ✗ Missing env vars:', missing.join(', '))
  }

  // Poll WooCommerce for stock updates every 10 minutes (if configured)
  setInterval(() => {
    if (woo.isConfigured()) {
      console.log('[woo] Running scheduled stock pull…')
      runWooSync().catch(console.error)
    }
  }, 10 * 60 * 1000)

  // ─── Announcements ─────────────────────────────────────────────────────────
  // Two separate intervals on purpose: the sweep is a single indexed SELECT over
  // a tiny table, while the sync is ~dozens of HTTP requests. Deliberately NOT
  // piggybacked on the Woo interval above, which is gated by woo.isConfigured()
  // — announcements would silently stop whenever Woo credentials were rotated.

  // Catch anything that fell due while the server was down.
  setTimeout(() => {
    try {
      const n = sweepScheduledAnnouncements()
      if (n > 0) console.log(`[announcements] Announced ${n} scheduled item(s) on boot`)
    } catch (e) { console.error('[announcements] boot sweep failed:', e) }

    if (wp.isSyncEnabled()) {
      console.log('[announcements] Running boot sync…')
      runAnnouncementSync('boot').catch(console.error)
    }
  }, 15_000)

  // Reveal scheduled announcements (and fire their notifications) every 5 min.
  setInterval(() => {
    try {
      const n = sweepScheduledAnnouncements()
      if (n > 0) console.log(`[announcements] Announced ${n} scheduled item(s)`)
    } catch (e) { console.error('[announcements] sweep failed:', e) }
  }, 5 * 60 * 1000)

  // Pull new press releases from WordPress every 30 min.
  setInterval(() => {
    if (wp.isSyncEnabled()) {
      console.log('[announcements] Running scheduled WordPress sync…')
      runAnnouncementSync('schedule').catch(console.error)
    }
  }, 30 * 60 * 1000)
})
