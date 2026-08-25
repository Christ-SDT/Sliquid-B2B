export interface User {
  id: number
  email: string
  name: string
  role: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'tier6' | 'tier7' | 'tier8'
  company?: string
  status?: string
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
