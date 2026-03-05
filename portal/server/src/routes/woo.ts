import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { woo, runWooSync } from '../woocommerce.js'

const router = Router()

// All woo routes require tier5 (admin) or legacy 'admin' role
const adminOnly = requireRole('tier5', 'admin')

// GET /api/woo/status
router.get('/status', requireAuth, adminOnly, (_req, res) => {
  const lastPull = db.prepare(
    "SELECT * FROM woo_sync_log WHERE direction = 'pull' ORDER BY id DESC LIMIT 1"
  ).get() ?? null
  const lastPush = db.prepare(
    "SELECT * FROM woo_sync_log WHERE direction = 'push' ORDER BY id DESC LIMIT 1"
  ).get() ?? null
  res.json({ configured: woo.isConfigured(), lastPull, lastPush })
})

// POST /api/woo/settings
router.post('/settings', requireAuth, adminOnly, (req, res) => {
  const { url, consumer_key, consumer_secret } = req.body as {
    url?: string; consumer_key?: string; consumer_secret?: string
  }
  if (!url || !consumer_key || !consumer_secret) {
    res.status(400).json({ message: 'url, consumer_key, and consumer_secret are required' })
    return
  }
  const upsert = db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)')
  upsert.run('wc_url', url.trim())
  upsert.run('wc_consumer_key', consumer_key.trim())
  upsert.run('wc_consumer_secret', consumer_secret.trim())
  res.json({ success: true })
})

// POST /api/woo/test
router.post('/test', requireAuth, adminOnly, async (_req, res) => {
  const result = await woo.testConnection()
  res.json(result)
})

// POST /api/woo/sync
router.post('/sync', requireAuth, adminOnly, async (_req, res) => {
  try {
    const result = await runWooSync()
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ message: e.message ?? 'Sync failed' })
  }
})

// POST /api/woo/sync-product
router.post('/sync-product', requireAuth, adminOnly, async (req, res) => {
  const { sku } = req.body as { sku?: string }
  if (!sku) {
    res.status(400).json({ message: 'sku is required' })
    return
  }
  try {
    const inv = db.prepare('SELECT * FROM inventory WHERE sku = ?').get(sku) as any
    if (!inv) {
      res.status(404).json({ message: 'Inventory item not found for this SKU' })
      return
    }
    const wcProduct = await woo.getProductBySKU(sku)
    if (!wcProduct) {
      res.status(404).json({ message: 'Product not found in WooCommerce' })
      return
    }
    await woo.updateProductStock(wcProduct.id, inv.quantity)
    db.prepare('INSERT INTO woo_sync_log (direction, status, products_updated, message) VALUES (?, ?, ?, ?)')
      .run('push', 'ok', 1, `Pushed stock for SKU ${sku}: qty ${inv.quantity}`)
    res.json({ success: true, sku, quantity: inv.quantity })
  } catch (e: any) {
    const msg = e.message ?? 'Sync failed'
    db.prepare('INSERT INTO woo_sync_log (direction, status, products_updated, message) VALUES (?, ?, ?, ?)')
      .run('push', 'error', 0, msg)
    res.status(500).json({ message: msg })
  }
})

export default router
