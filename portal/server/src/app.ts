import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
// Logger must be imported before anything else so console interception is
// in place before routes/database start emitting logs
import './logger.js'
import './database.js'

import logsRouter from './routes/logs.js'
import authRouter from './routes/auth.js'
import ssoRouter from './routes/sso.js'
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
import productShotsRouter from './routes/product-shots.js'
import b2bFormsRouter from './routes/b2b-forms.js'
import gdprRouter from './routes/gdpr.js'
import announcementsRouter from './routes/announcements.js'
import wellKnownRouter from './routes/wellKnown.js'
import { createMcpRouter } from './mcp/server.js'

const app = express()

// Required for express-rate-limit behind Railway's proxy
app.set('trust proxy', 1)

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

console.log('[cors] Allowed origins:', allowedOrigins)

// Paths that are fully public — allow any origin (no auth, no sensitive data).
//
// ⚠️ Keep announcements scoped to '/api/announcements/public'. The matcher below
// is a prefix match, so the broader '/api/announcements' would make EVERY
// announcements route (including admin writes) skip strictCors and inherit the
// hardcoded 'GET, OPTIONS' Allow-Methods below — breaking admin PUT/POST/DELETE
// preflights in the browser while every supertest test still passed, because
// supertest sends no Origin header.
const PUBLIC_PATHS = ['/api/products/catalog', '/api/b2b/contact', '/api/b2b/retailer-apply', '/api/b2b/hp-apply', '/api/b2b/booth-signup', '/api/gdpr/request', '/api/announcements/public']

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
app.use(cookieParser())

app.use('/auth/google', ssoRouter)
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
app.use('/api/product-shots', productShotsRouter)
app.use('/api/b2b', b2bFormsRouter)
app.use('/api/gdpr', gdprRouter)
app.use('/api/announcements', announcementsRouter)
app.use('/api/logs', logsRouter)

// ─── MCP ──────────────────────────────────────────────────────────────────────
//
// Deliberately NOT added to PUBLIC_PATHS. See the comment above that array: it
// is a PREFIX matcher, so an entry like '/mcp' would blanket every route under
// it with `Access-Control-Allow-Origin: *` and the hardcoded 'GET, OPTIONS'
// Allow-Methods — which would simultaneously open the endpoint to any browser
// origin AND break the POST the protocol actually runs on.
//
// Neither router needs it. ChatGPT talks to /mcp server-to-server and sends no
// Origin header, and the CORS middleware above already passes originless
// requests through (`if (!origin) callback(null, true)`). Access is gated by
// requireMcpScope inside the router, not by CORS.
app.use('/.well-known', wellKnownRouter)
app.use('/mcp', createMcpRouter())

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

export { app }
