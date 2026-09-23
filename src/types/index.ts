export interface NavLink {
  readonly label: string
  /** Key under `common:nav`. Absent = a proper name shown as-is (e.g. RIDE Lube). */
  readonly labelKey?: string
  readonly href: string
  readonly external?: boolean
}

export interface TopBarLink extends NavLink {
  readonly highlighted?: boolean
}

/** Copy (title, description, imageAlt, linkLabel) lives in `home:strategy.cards.<id>`. */
export interface StrategyCard {
  readonly id: string
  readonly imageUrl: string
  readonly linkHref: string
}

export interface StatItem {
  /** Key under `home:stats.items`. */
  readonly id: string
  readonly value: string
}

/** Copy (tagline, description, imageAlt) lives in `common:brands.<id>`; `name` is a proper name, never translated. */
export interface Brand {
  readonly id: string
  readonly name: string
  readonly imageUrl: string
  readonly siteUrl: string
}

export interface NewsArticle {
  readonly id: string
  readonly title: string
  readonly excerpt: string
  readonly category: string
  readonly date: string
  readonly imageUrl: string
  readonly imageAlt: string
  readonly href: string
  readonly featured?: boolean
}

/** Title and imageAlt live in `about:team.executives.<id>`. */
export interface Executive {
  readonly id: string
  readonly name: string
  readonly imageUrl: string
}

export interface ContactFormData {
  name: string
  company: string
  email: string
  phone?: string
  subject: string
  message: string
}

export type ContactFormErrors = Partial<Record<keyof ContactFormData, string>>

/**
 * A press release from the portal API (`/api/announcements/public`).
 *
 * `title` / `excerpt` / `image_url` / `published_at` are already resolved
 * server-side (any admin override COALESCEd over the WordPress value).
 *
 * Not `readonly` — unlike the static constants above, this is fetched API data.
 */
export interface Announcement {
  id: number
  slug: string
  source: 'wordpress' | 'portal'
  wp_link?: string | null
  title: string
  excerpt?: string | null
  image_url?: string | null
  published_at?: string | null
  /** Detail responses only. */
  body_html?: string | null
  /** 'document' = a standalone HTML doc that needs iframe isolation. */
  body_shape?: 'document' | 'rich' | null
  pinned?: number
}
