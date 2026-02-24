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

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
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

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

app.listen(PORT, () => {
  console.log(`Portal server running on http://localhost:${PORT}`)
})
