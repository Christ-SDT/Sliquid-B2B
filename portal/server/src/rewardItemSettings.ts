import { db } from './database.js'
import type { RewardItemSettings } from './contracts.js'

/**
 * Which WooCommerce products the certification-reward T-shirt and pin are.
 * Neither exists in the portal's `products` table, so they are mapped to Woo
 * ids directly. Stored in the shared `woo_settings` key/value table (no
 * migration), alongside the reward product allowlist in rewardOptions.ts.
 */
const KEYS = {
  shirt_product_id: 'reward_shirt_product_id',
  shirt_size_variations: 'reward_shirt_size_variations',
  pin_product_id: 'reward_pin_product_id',
  shipping_method_id: 'reward_shipping_method_id',
  shipping_method_title: 'reward_shipping_method_title',
} as const

export const DEFAULT_SHIPPING_METHOD_ID = 'free_shipping'
export const DEFAULT_SHIPPING_METHOD_TITLE = 'Free shipping'

function read(key: string): string | null {
  const row = db.prepare('SELECT value FROM woo_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function write(key: string, value: string | null): void {
  if (value === null) db.prepare('DELETE FROM woo_settings WHERE key = ?').run(key)
  else db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)').run(key, value)
}

function positiveInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

export function getRewardItemSettings(): RewardItemSettings {
  let variations: Record<string, number> = {}
  try {
    const parsed = JSON.parse(read(KEYS.shirt_size_variations) ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [size, id] of Object.entries(parsed)) {
        const n = positiveInt(id)
        if (n) variations[size] = n
      }
    }
  } catch { variations = {} }

  return {
    shirt_product_id: positiveInt(read(KEYS.shirt_product_id)),
    shirt_size_variations: variations,
    pin_product_id: positiveInt(read(KEYS.pin_product_id)),
    shipping_method_id: read(KEYS.shipping_method_id) || DEFAULT_SHIPPING_METHOD_ID,
    shipping_method_title: read(KEYS.shipping_method_title) || DEFAULT_SHIPPING_METHOD_TITLE,
  }
}

/**
 * Partial update; `null` clears a product mapping. Throws on a malformed value
 * so the route can 400 rather than silently storing junk.
 */
export function setRewardItemSettings(patch: Partial<RewardItemSettings>): RewardItemSettings {
  if ('shirt_product_id' in patch) {
    const v = patch.shirt_product_id
    if (v !== null && !positiveInt(v)) throw new Error('shirt_product_id must be a positive integer or null')
    write(KEYS.shirt_product_id, v === null ? null : String(v))
  }
  if ('pin_product_id' in patch) {
    const v = patch.pin_product_id
    if (v !== null && !positiveInt(v)) throw new Error('pin_product_id must be a positive integer or null')
    write(KEYS.pin_product_id, v === null ? null : String(v))
  }
  if (patch.shirt_size_variations !== undefined) {
    const m = patch.shirt_size_variations
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('shirt_size_variations must be an object')
    const clean: Record<string, number> = {}
    for (const [size, id] of Object.entries(m)) {
      const n = positiveInt(id)
      if (!n) throw new Error(`variation id for size ${size} must be a positive integer`)
      clean[size] = n
    }
    write(KEYS.shirt_size_variations, JSON.stringify(clean))
  }
  if (patch.shipping_method_id !== undefined) {
    write(KEYS.shipping_method_id, String(patch.shipping_method_id).trim() || null)
  }
  if (patch.shipping_method_title !== undefined) {
    write(KEYS.shipping_method_title, String(patch.shipping_method_title).trim() || null)
  }
  return getRewardItemSettings()
}
