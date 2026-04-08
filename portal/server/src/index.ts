import 'dotenv/config'
import { app } from './app.js'
import { woo, runWooSync } from './woocommerce.js'

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
})
