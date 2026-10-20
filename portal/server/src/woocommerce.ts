import { db } from './database.js'
import type { WooOrderStatus, WooProductHit, WooVariation } from './contracts.js'

export interface WCProduct {
  id: number
  name: string
  sku: string
  stock_quantity: number | null
  manage_stock: boolean
  stock_status: string
  /** 'simple' | 'variable' | 'variation' | … — `/products?sku=` can return a variation. */
  type?: string
  status?: string
  /** Set (non-zero) on a variation: its variable parent product. */
  parent_id?: number
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

/** The subset of a Woo order the portal reads back. */
export interface WooOrder {
  id: number
  number: string
  status: string
  meta_data?: { id?: number; key: string; value: unknown }[]
  [k: string]: unknown
}

/** A SKU resolved to the ids an order line item needs. */
export interface WooSkuMatch {
  product_id: number
  variation_id: number | null
  name: string
  sku: string
}

/**
 * A failed WooCommerce call. `status` is the HTTP status (null for a network
 * error or timeout); `message` carries Woo's own `message` when it sent one.
 * Never carries the consumer key/secret — see scrub().
 */
export class WooError extends Error {
  readonly status: number | null
  readonly wooCode: string | null
  constructor(message: string, status: number | null, wooCode: string | null = null) {
    super(message)
    this.name = 'WooError'
    this.status = status
    this.wooCode = wooCode
  }
}

const REQUEST_TIMEOUT_MS = 15_000
/** getAllProducts() safety stop: 200 pages × 100 = 20,000 products. */
const MAX_PRODUCT_PAGES = 200

/** WooCommerce's core order statuses — the fallback when the totals report is unavailable. */
export const CORE_ORDER_STATUSES: WooOrderStatus[] = [
  { slug: 'pending', name: 'Pending payment' },
  { slug: 'processing', name: 'Processing' },
  { slug: 'on-hold', name: 'On hold' },
  { slug: 'completed', name: 'Completed' },
  { slug: 'cancelled', name: 'Cancelled' },
  { slug: 'refunded', name: 'Refunded' },
  { slug: 'failed', name: 'Failed' },
]

type Query = Record<string, string | number | boolean | undefined>

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

  /**
   * Every Woo REST call goes through here: Basic auth from getConfig(), JSON
   * in/out, and a 15s timeout so a hung store can never hang a request or the
   * sync interval. Errors carry the HTTP status and Woo's `message`, scrubbed
   * of the credentials — they end up in responses, logs and last_error.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    const cfg = this.getConfig()
    if (!cfg) throw new WooError('WooCommerce is not configured', null, 'not_configured')

    const base = cfg.url.replace(/\/+$/, '')
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) qs.set(k, String(v))
    }
    const search = qs.toString()
    const url = `${base}/wp-json/wc/v3${path}${search ? `?${search}` : ''}`
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString('base64')}`,
      Accept: 'application/json',
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e: any) {
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      const msg = timedOut
        ? `WooCommerce did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Could not reach WooCommerce: ${e?.message ?? 'network error'}`
      throw new WooError(scrub(msg, cfg), null, timedOut ? 'timeout' : 'network')
    }

    if (!res.ok) {
      let wooMessage: string | null = null
      let wooCode: string | null = null
      try {
        const body = (await res.json()) as { message?: unknown; code?: unknown }
        if (typeof body?.message === 'string') wooMessage = body.message
        if (typeof body?.code === 'string') wooCode = body.code
      } catch { /* non-JSON error page */ }
      const msg = wooMessage ? `HTTP ${res.status}: ${stripTags(wooMessage)}` : `HTTP ${res.status}`
      throw new WooError(scrub(msg, cfg), res.status, wooCode)
    }

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.getConfig()) return { ok: false, error: 'Not configured' }
    try {
      await this.request('GET', '/system_status')
      return { ok: true }
    } catch (e: any) {
      if (e instanceof WooError && e.status !== null) {
        return { ok: false, error: `HTTP ${e.status} — check URL and credentials` }
      }
      return { ok: false, error: e.message ?? 'Connection failed' }
    }
  }

  async getAllProducts(): Promise<WCProduct[]> {
    if (!this.getConfig()) return []
    const all: WCProduct[] = []
    for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
      let data: WCProduct[]
      try {
        data = await this.request<WCProduct[]>('GET', '/products', { query: { per_page: 100, page } })
      } catch (e: any) {
        if (e instanceof WooError && e.status !== null) throw new Error(`WC API error: HTTP ${e.status}`)
        throw e
      }
      if (!Array.isArray(data) || data.length === 0) break
      all.push(...data)
      if (data.length < 100) break
    }
    return all
  }

  async getProductBySKU(sku: string): Promise<WCProduct | null> {
    if (!this.getConfig()) return null
    try {
      const data = await this.request<WCProduct[]>('GET', '/products', { query: { sku } })
      return Array.isArray(data) && data.length > 0 ? data[0] : null
    } catch (e) {
      // An HTTP error reads as "not found", as it always has; a network error propagates.
      if (e instanceof WooError && e.status !== null) return null
      throw e
    }
  }

  async updateProductStock(wcProductId: number, quantity: number): Promise<void> {
    if (!this.getConfig()) throw new Error('WooCommerce not configured')
    try {
      await this.request('PUT', `/products/${wcProductId}`, {
        body: { stock_quantity: quantity, manage_stock: true },
      })
    } catch (e: any) {
      if (e instanceof WooError && e.status !== null) throw new Error(`Failed to update WC stock: HTTP ${e.status}`)
      throw e
    }
  }

  /**
   * SKU → the ids a line item needs, or null when Woo has no such SKU. Unlike
   * getProductBySKU, every failure THROWS, so a caller can tell "not found"
   * from "Woo unreachable". `/products?sku=` can return a variation — then the
   * line item needs the parent as product_id and the variation as variation_id.
   */
  async findBySku(sku: string): Promise<WooSkuMatch | null> {
    const data = await this.request<WCProduct[]>('GET', '/products', { query: { sku } })
    const hit = Array.isArray(data) ? data.find(p => p.sku === sku) ?? data[0] : undefined
    if (!hit) return null
    if (hit.type === 'variation' && hit.parent_id) {
      return { product_id: hit.parent_id, variation_id: hit.id, name: hit.name, sku: hit.sku }
    }
    return { product_id: hit.id, variation_id: null, name: hit.name, sku: hit.sku }
  }

  async getProductById(id: number): Promise<WooProductHit | null> {
    try {
      const p = await this.request<WCProduct>('GET', `/products/${id}`)
      return toProductHit(p)
    } catch (e) {
      if (e instanceof WooError && e.status === 404) return null
      throw e
    }
  }

  async getVariations(productId: number): Promise<WooVariation[]> {
    const data = await this.request<any[]>('GET', `/products/${productId}/variations`, { query: { per_page: 100 } })
    return (Array.isArray(data) ? data : []).map(v => ({
      id: Number(v.id),
      sku: typeof v.sku === 'string' ? v.sku : '',
      attributes: Array.isArray(v.attributes)
        ? v.attributes.map((a: any) => ({ name: String(a?.name ?? ''), option: String(a?.option ?? '') }))
        : [],
      stock_status: typeof v.stock_status === 'string' ? v.stock_status : null,
    }))
  }

  /** Product picker search: name search plus an exact-SKU hit, at most 20 results. */
  async searchProducts(q: string): Promise<WooProductHit[]> {
    const [byName, bySku] = await Promise.all([
      this.request<WCProduct[]>('GET', '/products', { query: { search: q, per_page: 20 } }),
      this.request<WCProduct[]>('GET', '/products', { query: { sku: q, per_page: 20 } }).catch(() => [] as WCProduct[]),
    ])
    const seen = new Set<number>()
    const out: WooProductHit[] = []
    for (const p of [...(Array.isArray(bySku) ? bySku : []), ...(Array.isArray(byName) ? byName : [])]) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(toProductHit(p))
      if (out.length >= 20) break
    }
    return out
  }

  async findCustomerByEmail(email: string): Promise<number | null> {
    // role=all: the default only lists the 'customer' role, missing staff/wholesale accounts.
    const data = await this.request<{ id: number; email?: string }[]>('GET', '/customers', {
      query: { email, role: 'all', per_page: 1 },
    })
    const hit = Array.isArray(data) ? data[0] : undefined
    return hit?.id ? Number(hit.id) : null
  }

  async createOrder(payload: Record<string, unknown>): Promise<WooOrder> {
    return this.request<WooOrder>('POST', '/orders', { body: payload })
  }

  /** The order, or null when Woo answers 404 (deleted permanently). */
  async getOrder(id: number): Promise<WooOrder | null> {
    try {
      return await this.request<WooOrder>('GET', `/orders/${id}`)
    } catch (e) {
      if (e instanceof WooError && e.status === 404) return null
      throw e
    }
  }

  async updateOrder(id: number, patch: Record<string, unknown>): Promise<WooOrder> {
    return this.request<WooOrder>('PUT', `/orders/${id}`, { body: patch })
  }

  /** DELETE without `force` → Woo moves the order to the trash (recoverable there). */
  async trashOrder(id: number): Promise<WooOrder> {
    return this.request<WooOrder>('DELETE', `/orders/${id}`)
  }

  async addOrderNote(id: number, note: string, customerNote = false): Promise<void> {
    await this.request('POST', `/orders/${id}/notes`, { body: { note, customer_note: customerNote } })
  }

  /**
   * Crash recovery for a push: find an order already carrying this reward's
   * `_sliquid_reward_id` meta. Woo's REST API cannot filter on meta, so this
   * narrows by billing email (Woo's order search covers it) when given, else
   * the most recent orders, and matches the meta client-side. When the
   * certificate number is known it must match too — reward ids are per
   * portal database, and a dev database pushing to the live store would
   * otherwise "recover" a stranger's order. Trashed orders are ignored.
   */
  async findOrderByRewardId(
    rewardId: number,
    hint: { email?: string; certificateNumber?: string | null } = {},
  ): Promise<WooOrder | null> {
    const data = await this.request<WooOrder[]>('GET', '/orders', {
      query: {
        per_page: 100,
        orderby: 'date',
        order: 'desc',
        ...(hint.email ? { search: hint.email } : {}),
      },
    })
    const meta = (o: WooOrder, key: string) => o.meta_data?.find(m => m.key === key)?.value
    return (Array.isArray(data) ? data : []).find(o =>
      o.status !== 'trash'
      && String(meta(o, '_sliquid_reward_id') ?? '') === String(rewardId)
      && (!hint.certificateNumber
        || meta(o, '_sliquid_certificate') === undefined
        || String(meta(o, '_sliquid_certificate')) === hint.certificateNumber),
    ) ?? null
  }

  /**
   * Every registered order status, plugin ones included, from the totals
   * report. Falls back to the core list when that report is unavailable.
   */
  async getOrderStatuses(): Promise<WooOrderStatus[]> {
    try {
      const data = await this.request<{ slug?: unknown; name?: unknown }[]>('GET', '/reports/orders/totals')
      const out = (Array.isArray(data) ? data : [])
        .filter(s => typeof s.slug === 'string' && s.slug)
        .map(s => {
          const slug = String(s.slug).replace(/^wc-/, '')
          return { slug, name: typeof s.name === 'string' && s.name ? s.name : slug }
        })
      return out.length > 0 ? out : CORE_ORDER_STATUSES
    } catch {
      return CORE_ORDER_STATUSES
    }
  }

  /** The order's edit screen in wp-admin, or null when Woo is not configured. */
  adminOrderUrl(id: number): string | null {
    const cfg = this.getConfig()
    if (!cfg) return null
    return `${cfg.url.replace(/\/+$/, '')}/wp-admin/post.php?post=${id}&action=edit`
  }
}

function toProductHit(p: WCProduct): WooProductHit {
  return {
    id: Number(p.id),
    name: String(p.name ?? ''),
    sku: typeof p.sku === 'string' ? p.sku : '',
    type: String(p.type ?? 'simple'),
    status: String(p.status ?? ''),
    stock_status: typeof p.stock_status === 'string' ? p.stock_status : null,
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim()
}

/** Remove the credentials (and anything shaped like a Woo key) from a message. */
function scrub(message: string, cfg: WCConfig): string {
  let out = message
  for (const secret of [cfg.key, cfg.secret]) {
    if (secret) out = out.split(secret).join('[redacted]')
  }
  return out.replace(/\b(ck|cs)_[A-Za-z0-9]{8,}\b/g, '[redacted]').slice(0, 500)
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
