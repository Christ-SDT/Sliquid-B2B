/**
 * Wire contracts for the Admin Dashboard, certification-reward orders and the
 * SSO notification relay. The client mirrors these in
 * `portal/client/src/types/index.ts` — change both together.
 *
 * Nothing in here may ever carry a secret (Woo keys, EmailJS keys, SSO client
 * secret, AWS keys). The integrations endpoint is readable by Legal (tier8).
 */

// ─── Reward orders ────────────────────────────────────────────────────────────

export type RewardOrderState = 'draft' | 'pushing' | 'pushed' | 'failed' | 'deleted'
export type RewardOrderLineKind = 'product' | 'shirt' | 'pin'

export interface RewardOrderLine {
  kind: RewardOrderLineKind
  sku: string | null
  woo_product_id: number | null
  /** Set for a variable product (the shirt size); null for simple products. */
  woo_variation_id: number | null
  name: string
  quantity: number
  /** Why this line cannot be pushed yet; null once it is resolved. */
  issue: string | null
}

/** WooCommerce shipping field names, so the object is sent to Woo unchanged. */
export interface RewardOrderShipping {
  first_name: string
  last_name: string
  company: string
  address_1: string
  address_2: string
  city: string
  state: string
  postcode: string
  country: string
}

export interface RewardOrder {
  id: number
  cert_reward_id: number
  state: RewardOrderState
  lines: RewardOrderLine[]
  shipping: RewardOrderShipping
  customer_note: string | null
  woo_order_id: number | null
  woo_order_number: string | null
  /** Woo status slug without the `wc-` prefix, e.g. 'processing'. */
  woo_status: string | null
  /** `${wc_url}/wp-admin/post.php?post=<id>&action=edit`, null until pushed. */
  woo_admin_url: string | null
  last_error: string | null
  created_by: number | null
  pushed_by: number | null
  pushed_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  /** Every blocking problem; push is allowed only when this is empty. */
  issues: string[]
}

export interface RewardOrderEvent {
  id: number
  action: 'drafted' | 'edited' | 'pushed' | 'push_failed' | 'status' | 'refreshed' | 'emailed' | 'deleted'
  detail: string | null
  actor_name: string | null
  created_at: string
}

/** Left side of the review modal — the claim exactly as the partner submitted it. */
export interface RewardRequest {
  reward_id: number
  user_id: number
  full_name: string
  email: string
  company: string | null
  certificate_number: string | null
  avg_score: number | null
  submitted_at: string
  /** Display label as claimed, e.g. "Naturals Silk (4.2 oz)". */
  product: string
  product_sku: string | null
  shirt_size: string
  address1: string
  address2: string | null
  city: string
  state: string
  zip: string
  fulfilled: boolean
  fulfilled_at: string | null
}

/** GET /api/reward-orders/:rewardId */
export interface RewardOrderDetail {
  request: RewardRequest
  order: RewardOrder | null
  events: RewardOrderEvent[]
  /** Woo customer id whose email matches the partner's, if any. */
  woo_customer_id: number | null
}

/** PUT /api/reward-orders/:rewardId — every field optional. */
export interface RewardOrderPatch {
  lines?: RewardOrderLine[]
  shipping?: Partial<RewardOrderShipping>
  customer_note?: string | null
}

/** Shown on each Rewards-tab row (GET /api/certificates/rewards adds these). */
export interface RewardOrderBadge {
  order_state: RewardOrderState | null
  woo_status: string | null
  woo_order_number: string | null
}

export interface WooOrderStatus { slug: string; name: string }

export interface WooProductHit {
  id: number
  name: string
  sku: string
  type: string // 'simple' | 'variable' | …
  status: string
  stock_status: string | null
}

export interface WooVariation {
  id: number
  sku: string
  attributes: { name: string; option: string }[]
  stock_status: string | null
}

/** GET /api/reward-orders/meta/summary — Admin Dashboard "Orders" card. */
export interface RewardOrderSummary {
  claims_total: number
  not_started: number
  draft: number
  pushing: number
  failed: number
  pushed: number
  by_woo_status: Record<string, number>
}

/** woo_settings-backed mapping of the reward shirt + pin to Woo products. */
export interface RewardItemSettings {
  shirt_product_id: number | null
  /** Portal shirt size (S, M, …) → Woo variation id. */
  shirt_size_variations: Record<string, number>
  pin_product_id: number | null
  shipping_method_id: string
  shipping_method_title: string
}

// ─── Admin Dashboard integrations ────────────────────────────────────────────

export type IntegrationId =
  | 'woocommerce' | 'wordpress' | 'emailjs' | 'sso' | 'sso_notifications'
  | 'mcp' | 's3' | 'gemini' | 'mailchimp'

export interface IntegrationStatus {
  id: IntegrationId
  name: string
  configured: boolean
  /** Where the active config came from. */
  source: 'env' | 'saved' | 'default' | 'mixed' | 'none'
  /** Non-secret facts only: URLs, ids, booleans, counts. */
  details: Record<string, string | number | boolean | null>
  lastActivity: string | null
  lastResult: 'ok' | 'error' | null
  lastMessage: string | null
  testable: boolean
  /** Where an admin changes it: on the dashboard, in Railway env, or another page. */
  manage: 'dashboard' | 'env' | 'page'
  manageHint: string | null
}

export interface IntegrationTestResult { ok: boolean; message: string }

// ─── SSO notification relay ──────────────────────────────────────────────────

/**
 * POST {SSO_NOTIFICATIONS_URL} with HTTP Basic SSO_CLIENT_ID:SSO_CLIENT_SECRET.
 * 202 → accepted, 200 → duplicate event_id (already have it), 403 → this client
 * is not enabled to post notifications. Anything else is retried.
 */
export interface SsoNotificationPayload {
  event_id: string
  type: string
  title: string
  message: string
  /** Absolute portal URL. */
  link: string | null
  /** SSO role enum values, e.g. 'sliquid_sales'. */
  audience_roles: string[]
  occurred_at: string // ISO 8601
}

export const SSO_ROLES = [
  'sliquid_employee', 'sliquid_sales', 'sliquid_marketing', 'sliquid_warehouse_manager',
  'sliquid_accounting', 'sliquid_legal', 'sliquid_development', 'sliquid_super_admin', 'sliquid_owner',
] as const

export interface SsoOutboxRow {
  id: number
  event_id: string
  type: string
  title: string
  attempts: number
  next_attempt_at: string
  delivered_at: string | null
  last_error: string | null
  created_at: string
}

/** GET /api/admin/sso-notifications */
export interface SsoNotifySettings {
  enabled: boolean
  /** URL + client credentials present in env. */
  configured: boolean
  /** Names (never values) of the env vars still missing when !configured. */
  missing?: string[]
  url: string | null
  /** notification type → SSO roles. A type absent here is not relayed. */
  routing: Record<string, string[]>
  eventTypes: { type: string; label: string }[]
  ssoRoles: string[]
  counts: { pending: number; delivered: number; failing: number }
  recent: SsoOutboxRow[]
}

// ─── Product Library collections ─────────────────────────────────────────────

export type CollectionStatus = 'draft' | 'scheduled' | 'released'

export interface CollectionPhoto {
  id: number            // assets.id
  name: string
  file_url: string      // full-resolution S3 URL
  thumbnail_url: string // small webp preview (falls back to file_url)
  file_size: string | null
  dimensions: string | null
  sort_order: number
}

export interface AssetCollection {
  id: number
  name: string
  brand: string
  description: string | null
  status: CollectionStatus
  release_at: string | null   // SQLite UTC 'YYYY-MM-DD HH:MM:SS'
  released_at: string | null
  cover_asset_id: number | null
  cover_url: string | null    // thumbnail of the cover (or first photo)
  photo_count: number
  created_at: string
  updated_at: string
}

export interface AssetCollectionDetail extends AssetCollection {
  photos: CollectionPhoto[]
}

/** POST /api/collections/:id/photos — per-request result (a few files per call). */
export interface CollectionUploadResult {
  photos: CollectionPhoto[]
  errors: { file: string; message: string }[]
}
