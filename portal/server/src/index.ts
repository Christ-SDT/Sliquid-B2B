import 'dotenv/config'
import { app } from './app.js'
import { woo, runWooSync } from './woocommerce.js'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.listen(PORT, () => {
  console.log(`Portal server running on http://localhost:${PORT}`)

  // Poll WooCommerce for stock updates every 10 minutes (if configured)
  setInterval(() => {
    if (woo.isConfigured()) {
      console.log('[woo] Running scheduled stock pull…')
      runWooSync().catch(console.error)
    }
  }, 10 * 60 * 1000)
})
