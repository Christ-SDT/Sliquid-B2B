import express from 'express'
import cors from 'cors'
import './database.js'

import authRouter from './routes/auth.js'
import productsRouter from './routes/products.js'
import assetsRouter from './routes/assets.js'
import distributorsRouter from './routes/distributors.js'
import invoicesRouter from './routes/invoices.js'
import inventoryRouter from './routes/inventory.js'
import statsRouter from './routes/stats.js'
import retailerRouter from './routes/retailer.js'
import creativesRouter from './routes/creatives.js'
import quizRouter from './routes/quiz.js'
import adminRouter from './routes/admin.js'
import wooRouter from './routes/woo.js'
import storesRouter from './routes/stores.js'
import storeRouter from './routes/store.js'
import notificationsRouter from './routes/notifications.js'
import marketingItemsRouter from './routes/marketing-items.js'
import trainingsRouter from './routes/trainings.js'
import { woo, runWooSync } from './woocommerce.js'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/user', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/distributors', distributorsRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/stats', statsRouter)
app.use('/api/retailer', retailerRouter)
app.use('/api/creatives', creativesRouter)
app.use('/api/quiz', quizRouter)
app.use('/api/admin', adminRouter)
app.use('/api/woo', wooRouter)
app.use('/api/stores', storesRouter)
app.use('/api/store', storeRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/marketing-items', marketingItemsRouter)
app.use('/api/trainings', trainingsRouter)

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

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
