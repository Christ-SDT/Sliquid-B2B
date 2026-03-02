import { db } from './database.js'

export interface WCProduct {
  id: number
  name: string
  sku: string
  stock_quantity: number | null
  manage_stock: boolean
  stock_status: string
}

interface WCConfig {
  url: string
  key: string
  secret: string
}

export interface SyncResult {
  direction: 'pull'
  status: 'ok' | 'error'
  products_updated: number
  message?: string
}

export class WooCommerceService {
  getConfig(): WCConfig | null {
    // Env vars take precedence over DB settings
    const url = process.env.WC_URL
    const key = process.env.WC_CONSUMER_KEY
    const secret = process.env.WC_CONSUMER_SECRET
    if (url && key && secret) return { url, key, secret }

    try {
      const rows = db.prepare('SELECT key, value FROM woo_settings').all() as { key: string; value: string }[]
      const s: Record<string, string> = {}
      for (const r of rows) s[r.key] = r.value
      if (s.wc_url && s.wc_consumer_key && s.wc_consumer_secret) {
        return { url: s.wc_url, key: s.wc_consumer_key, secret: s.wc_consumer_secret }
      }
    } catch {
      // Table may not exist yet (before migration runs)
    }
    return null
  }

  isConfigured(): boolean {
    return this.getConfig() !== null
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const cfg = this.getConfig()
    if (!cfg) return { ok: false, error: 'Not configured' }
    try {
      const auth = Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')
      const res = await fetch(`${cfg.url}/wp-json/wc/v3/system_status`, {
        headers: { Authorization: `Basic ${auth}` },
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check URL and credentials` }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message ?? 'Connection failed' }
    }
  }

  async getAllProducts(): Promise<WCProduct[]> {
    const cfg = this.getConfig()
    if (!cfg) return []
    const auth = Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')
    const all: WCProduct[] = []
    let page = 1
    while (true) {
      const res = await fetch(
        `${cfg.url}/wp-json/wc/v3/products?per_page=100&page=${page}`,
        { headers: { Authorization: `Basic ${auth}` } }
      )
      if (!res.ok) throw new Error(`WC API error: HTTP ${res.status}`)
      const data = (await res.json()) as WCProduct[]
      if (data.length === 0) break
      all.push(...data)
      if (data.length < 100) break
      page++
    }
    return all
  }

  async getProductBySKU(sku: string): Promise<WCProduct | null> {
    const cfg = this.getConfig()
    if (!cfg) return null
    const auth = Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')
    const res = await fetch(
      `${cfg.url}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    )
    if (!res.ok) return null
    const data = (await res.json()) as WCProduct[]
    return data.length > 0 ? data[0] : null
  }

  async updateProductStock(wcProductId: number, quantity: number): Promise<void> {
    const cfg = this.getConfig()
    if (!cfg) throw new Error('WooCommerce not configured')
    const auth = Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')
    const res = await fetch(`${cfg.url}/wp-json/wc/v3/products/${wcProductId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stock_quantity: quantity, manage_stock: true }),
    })
    if (!res.ok) throw new Error(`Failed to update WC stock: HTTP ${res.status}`)
  }
}

export const woo = new WooCommerceService()

export async function runWooSync(): Promise<SyncResult> {
  try {
    const wcProducts = await woo.getAllProducts()
    let updated = 0

    for (const wcp of wcProducts) {
      if (!wcp.sku) continue
      const inv = db.prepare('SELECT * FROM inventory WHERE sku = ?').get(wcp.sku) as any

      if (inv) {
        // Update portal inventory quantity from WC
        const qty = wcp.stock_quantity ?? 0
        const status = qty === 0 ? 'out_of_stock' : qty <= inv.reorder_level ? 'low_stock' : 'in_stock'
        db.prepare("UPDATE inventory SET quantity = ?, status = ?, last_updated = datetime('now') WHERE id = ?")
          .run(qty, status, inv.id)
        updated++
      } else {
        // Check if a matching product row exists but has no inventory row
        const prod = db.prepare('SELECT id, name, brand FROM products WHERE sku = ?').get(wcp.sku) as any
        if (!prod) {
          // Auto-import as a new product
          const ins = db.prepare(
            'INSERT OR IGNORE INTO products (name, brand, category, sku, price, in_stock) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(wcp.name, 'Imported', 'Uncategorized', wcp.sku, 0, (wcp.stock_quantity ?? 0) > 0 ? 1 : 0)
          const productId = ins.lastInsertRowid
          if (productId) {
            const qty = wcp.stock_quantity ?? 0
            const status = qty === 0 ? 'out_of_stock' : qty <= 20 ? 'low_stock' : 'in_stock'
            db.prepare(
              'INSERT INTO inventory (product_id, product_name, brand, sku, quantity, reorder_level, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(productId, wcp.name, 'Imported', wcp.sku, qty, 20, status)
            updated++
          }
        }
      }
    }

    db.prepare('INSERT INTO woo_sync_log (direction, status, products_updated, message) VALUES (?, ?, ?, ?)')
      .run('pull', 'ok', updated, `Synced ${wcProducts.length} WC products`)

    return { direction: 'pull', status: 'ok', products_updated: updated }
  } catch (e: any) {
    const msg = e.message ?? 'Unknown error'
    db.prepare('INSERT INTO woo_sync_log (direction, status, products_updated, message) VALUES (?, ?, ?, ?)')
      .run('pull', 'error', 0, msg)
    return { direction: 'pull', status: 'error', products_updated: 0, message: msg }
  }
}
