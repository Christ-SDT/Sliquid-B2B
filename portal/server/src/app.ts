import express from 'express'
import cors from 'cors'
// Logger must be imported before anything else so console interception is
// in place before routes/database start emitting logs
import './logger.js'
import './database.js'

import logsRouter from './routes/logs.js'
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
import certificatesRouter from './routes/certificates.js'
import trainingOptionsRouter from './routes/training-options.js'
import creatorRouter from './routes/creator.js'
import mediaRouter from './routes/media.js'
import referenceImagesRouter from './routes/reference-images.js'
import medicalMarketingRouter from './routes/medical-marketing.js'

const app = express()

// Required for express-rate-limit behind Railway's proxy
app.set('trust proxy', 1)

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

console.log('[cors] Allowed origins:', allowedOrigins)

// Paths that are fully public — allow any origin (no auth, no sensitive data)
const PUBLIC_PATHS = ['/api/products/catalog']

const strictCors = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
})

app.use((req, res, next) => {
  const isPublic = PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))
  if (isPublic) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    next()
    return
  }
  strictCors(req, res, next)
})
app.use(express.json({ limit: '20mb' }))

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
app.use('/api/certificates', certificatesRouter)
app.use('/api/training-options', trainingOptionsRouter)
app.use('/api/creator', creatorRouter)
app.use('/api/media', mediaRouter)
app.use('/api/reference-images', referenceImagesRouter)
app.use('/api/medical-marketing', medicalMarketingRouter)
app.use('/api/logs', logsRouter)

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

export { app }
