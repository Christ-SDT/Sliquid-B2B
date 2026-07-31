export interface NavLink {
  readonly label: string
  readonly href: string
  readonly external?: boolean
}

export interface TopBarLink extends NavLink {
  readonly highlighted?: boolean
}

export interface StrategyCard {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly imageUrl: string
  readonly imageAlt: string
  readonly linkHref: string
  readonly linkLabel: string
}

export interface StatItem {
  readonly value: string
  readonly label: string
}

export interface Brand {
  readonly id: string
  readonly name: string
  readonly tagline: string
  readonly description: string
  readonly imageUrl: string
  readonly imageAlt: string
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

export interface Executive {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly imageUrl: string
  readonly imageAlt: string
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
