export interface User {
  id: number
  email: string
  name: string
  role: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'tier6' | 'tier7' | 'tier8'
  company?: string
  status?: string
  /** 'en' | 'es' | 'fr', or null if the user never picked one (browser language applies). */
  preferred_language?: string | null
}

export const TIER_LABEL: Record<string, string> = {
  tier1: 'Retail Store Employee',
  tier2: 'Retail Management',
  tier3: 'Distributor',
  tier4: 'Prospect',
  tier5: 'Admin',
  tier6: 'Medical Partner',
  tier7: 'Media',
  tier8: 'Legal (Read-Only)',
}

export function isLimitedTier(role: string): boolean {
  return role === 'tier1' || role === 'tier2' || role === 'tier3' || role === 'tier6' || role === 'tier7'
}

export function isProspect(role: string): boolean {
  return role === 'tier4'
}

export function isAdmin(role: string): boolean {
  return role === 'tier5' || role === 'admin'
}

/** Legal: tier8. Sees every admin surface, changes nothing. */
export function isLegal(role: string): boolean {
  return role === 'tier8'
}

/**
 * Gates admin **reads/navigation** — every admin route and nav row a real
 * admin can reach, Legal can also reach. Strict superset of `isAdmin`.
 * Never use this to guard a write — see `isAdmin`.
 */
export function canViewAdmin(role: string): boolean {
  return isAdmin(role) || isLegal(role)
}

/**
 * `isAdmin` continues to gate every **write** path in the app — do not add
 * tier8 to it. This flag exists only to drive read-only UI (banners,
 * disabled/hidden controls, plain-text stand-ins for editors) for a caller
 * that can view admin surfaces but must not be able to write to them.
 */
export function isReadOnlyAdmin(role: string): boolean {
  return !isAdmin(role) && isLegal(role)
}

export interface Product {
  id: number
  brand: string
  name: string
  sku: string
  category: string
  description?: string
  price: number
  image_url?: string | null
  in_stock: number
  // Catalog fields (Jan 2026 price sheet)
  vendor_number?: string
  upc?: string
  unit_size?: string
  case_pack?: number
  case_cost?: number
  unit_msrp?: number
  case_weight?: string
  unit_dimensions?: string
  case_dimensions?: string
  is_new?: number
}

export interface Asset {
  id: number
  brand: string
  name: string
  type: string
  file_url: string
  thumbnail_url?: string | null
  file_size?: string | null
  dimensions?: string | null
  s3_key?: string | null
  created_at?: string
  featured?: number
}

export interface Distributor {
  id: number
  name: string
  region: string       // filter category: "US" | "Canada" | "UK" | "Mexico" | "US, Canada"
  state: string        // display locations: "CO, MI, AZ" | "BC" | "West Sussex" etc.
  city?: string | null
  address?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
}

export interface InvoiceItem {
  product: string
  qty: number
  unit_price: number
}

export interface Invoice {
  id: number
  invoice_number: string
  partner_id?: number
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  due_date: string
  issued_date: string
  items: InvoiceItem[]
  notes?: string | null
}

export interface InventoryItem {
  id: number
  product_id?: number
  product_name: string
  brand: string
  sku: string
  quantity: number
  reorder_level: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock'
  last_updated?: string
  unit_size?: string | null
  image_url?: string | null
}

export interface Creative {
  id: number
  title: string
  brand: string
  type: string
  campaign?: string | null
  thumbnail_url?: string | null
  file_url: string
  description?: string | null
  dimensions?: string | null
  file_size?: string | null
  s3_key?: string | null
  created_at?: string
  featured?: number
}

export interface AiImage {
  id: number
  user_id: number
  created_by: string
  prompt: string
  s3_url: string
  s3_key: string
  model: string
  created_at?: string
}

export interface StatsOverview {
  totalProducts: number
  totalAssets: number
  pendingInvoices: number
  overdueInvoices: number
  lowStock: number
  outOfStock: number
  totalRevenue: number
  distributors: number
}

/**
 * A press release synced from WordPress, or a portal-authored announcement.
 *
 * `title` / `excerpt` / `image_url` / `published_at` are already resolved
 * server-side (admin override COALESCEd over the WordPress value), so read
 * those and ignore the `*_override` / `wp_*` pairs outside the admin UI.
 *
 * Booleans are 0/1 numbers, matching the rest of this file (see Asset.featured).
 */
export interface Announcement {
  id: number
  slug: string
  source: 'wordpress' | 'portal'
  wp_id?: number | null
  wp_link?: string | null

  // Resolved values
  title: string
  excerpt?: string | null
  image_url?: string | null
  published_at?: string | null

  /** Present on detail responses only — omitted from lists to keep them small. */
  body_html?: string | null
  /** 'document' = a standalone HTML doc needing iframe isolation. */
  body_shape?: 'document' | 'rich' | null
  content_css?: string | null

  // Admin-only fields (returned by /announcements/admin)
  title_override?: string | null
  excerpt_override?: string | null
  body_html_override?: string | null
  image_url_override?: string | null
  wp_title?: string | null
  wp_excerpt_html?: string | null
  status?: 'hidden' | 'published' | 'archived'
  effective_status?: 'hidden' | 'scheduled' | 'live' | 'expired' | 'archived'
  publish_at?: string | null
  expires_at?: string | null
  admin_notes?: string | null
  notified_at?: string | null
  last_synced_at?: string | null

  show_in_portal: number
  show_on_public: number
  pinned: number
  sort_order?: number

  created_at?: string
  updated_at?: string
}

export interface AnnouncementSyncStatus {
  configured: boolean
  enabled: boolean
  config: { baseUrl: string; categoryId: number; cutoffDate: string; hasAuth: boolean }
  watermark?: string | null
  lastSync?: {
    synced_at: string
    trigger_source: string
    status: 'ok' | 'error'
    posts_seen: number
    posts_created: number
    posts_updated: number
    posts_skipped: number
    message?: string | null
  } | null
  counts: {
    total: number; hidden: number; archived: number
    live: number; scheduled: number; portal_only: number
  }
}

// ═══ Admin Dashboard · reward orders · SSO notification relay ═══════════════
// Mirrors portal/server/src/contracts.ts — change both together.

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
