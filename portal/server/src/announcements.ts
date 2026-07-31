/**
 * Announcements domain logic — SQL fragments and the publish-notification sweep.
 *
 * Kept separate from routes/announcements.ts so it is testable without
 * supertest, mirroring the existing woocommerce.ts / routes/woo.ts split.
 */

import { db } from './database.js'
import { notifyEveryone, notifyUserIds } from './notifications.js'

/**
 * "Is this announcement live right now?" — the single visibility predicate.
 *
 * A scheduled announcement is `status='published'` with a future `publish_at`;
 * there is deliberately no 'scheduled' status, because that would need a
 * background job to flip it. Evaluating the time at read time instead means
 * scheduling survives restarts and cannot drift.
 *
 * ⚠️ Depends on publish_at/expires_at being stored as 'YYYY-MM-DD HH:MM:SS'
 * (see normalizeTs in wordpress.ts). An ISO string with a 'T' breaks this
 * comparison silently.
 */
export const LIVE_SQL = `
  status = 'published'
  AND (publish_at IS NULL OR publish_at <= datetime('now'))
  AND (expires_at IS NULL OR expires_at >  datetime('now'))`

/** Pinned first, then manual order, then newest. */
export const ORDER_SQL = `
  ORDER BY pinned DESC, sort_order ASC,
           COALESCE(publish_at, wp_date_gmt, created_at) DESC, id DESC`

/**
 * Columns for list responses. Admin overrides are resolved server-side via
 * COALESCE so clients never branch on them, and `wp_content_html` is
 * deliberately absent — bodies are ~5 KB each and belong only in detail
 * responses. Never `SELECT *` here: it would leak wp_status, admin_notes and
 * created_by onto the public wire.
 */
export const LIST_COLS = `
  id, source, wp_id, slug, wp_link, content_shape AS body_shape,
  pinned, sort_order,
  COALESCE(title_override,     wp_title)              AS title,
  COALESCE(excerpt_override,   wp_excerpt_html)       AS excerpt,
  COALESCE(image_url_override, wp_featured_image_url) AS image_url,
  COALESCE(publish_at, wp_date_gmt, created_at)       AS published_at,
  expires_at, show_in_portal, show_on_public`

export const DETAIL_COLS = `${LIST_COLS},
  COALESCE(body_html_override, wp_content_html)       AS body_html,
  content_css`

/**
 * Derived status for the admin table, computed in SQL so the client needs no
 * clock logic (and cannot disagree with the server about what is live).
 */
export const EFFECTIVE_STATUS_SQL = `
  CASE
    WHEN status <> 'published'                                    THEN status
    WHEN publish_at IS NOT NULL AND publish_at >  datetime('now') THEN 'scheduled'
    WHEN expires_at IS NOT NULL AND expires_at <= datetime('now') THEN 'expired'
    ELSE 'live'
  END AS effective_status`

/** Admin list: everything, including hidden/archived rows and raw WP values. */
export const ADMIN_COLS = `
  id, source, wp_id, wp_slug, wp_link, wp_status, wp_date, wp_date_gmt,
  wp_modified, wp_title, wp_excerpt_html, wp_featured_image_url,
  content_shape AS body_shape, content_css,
  slug, title_override, excerpt_override, image_url_override,
  status, publish_at, expires_at,
  show_in_portal, show_on_public, pinned, sort_order,
  notified_at, admin_notes, created_by,
  first_seen_at, last_synced_at, created_at, updated_at,
  COALESCE(title_override,     wp_title)              AS title,
  COALESCE(excerpt_override,   wp_excerpt_html)        AS excerpt,
  COALESCE(image_url_override, wp_featured_image_url)  AS image_url,
  COALESCE(publish_at, wp_date_gmt, created_at)        AS published_at,
  ${EFFECTIVE_STATUS_SQL}`

/**
 * Mass-assignment allowlist for POST/PUT. Anything absent here cannot be set
 * from a request body — in particular every `wp_*` column, `source`, `id`,
 * `notified_at` and `created_by`.
 *
 * `status`, `publish_at` and `expires_at` are handled by the dedicated
 * /schedule endpoint but are also accepted here for convenience; both paths run
 * them through normalizeTs.
 */
export const EDITABLE_FIELDS = [
  'title_override',
  'excerpt_override',
  'body_html_override',
  'image_url_override',
  'status',
  'publish_at',
  'expires_at',
  'show_in_portal',
  'show_on_public',
  'pinned',
  'sort_order',
  'admin_notes',
] as const

export const VALID_STATUSES = ['hidden', 'published', 'archived'] as const

/**
 * Notify every user about announcements that have become live since the last
 * pass, then stamp `notified_at` so they are never announced twice.
 *
 * Idempotent by design, which is what lets one code path serve both the
 * periodic sweep and an immediate admin publish. `notified_at` is an
 * admin-owned column, so a later WordPress edit to an already-announced post
 * does not re-notify.
 *
 * Only portal-visible announcements notify — a public-site-only announcement is
 * not something portal users need a bell for.
 *
 * @returns how many announcements were announced.
 */
export function sweepScheduledAnnouncements(): number {
  const due = db.prepare(`
    SELECT id, slug, show_on_public, COALESCE(title_override, wp_title) AS title
    FROM announcements
    WHERE notified_at IS NULL
      AND show_in_portal = 1
      AND ${LIVE_SQL}
  `).all() as { id: number; slug: string; show_on_public: number; title: string }[]

  if (!due.length) return 0

  const mark = db.prepare("UPDATE announcements SET notified_at = datetime('now') WHERE id = ?")

  for (const a of due) {
    if (a.show_on_public === 1) {
      // Also on the public B2B site, so it is safe for everyone including users
      // still awaiting approval.
      notifyEveryone('new_announcement', 'New announcement', a.title, `/announcements/${a.slug}`)
    } else {
      // Partner-only. Pending users cannot open it (their feed is filtered to
      // the public subset — see PENDING_SURFACE in routes/announcements.ts), so
      // notifying them would be a dead link.
      const ids = (db.prepare(
        "SELECT id FROM users WHERE status IS NULL OR status <> 'pending'"
      ).all() as { id: number }[]).map(r => r.id)
      notifyUserIds(ids, 'new_announcement', 'New announcement', a.title, `/announcements/${a.slug}`)
    }
    mark.run(a.id)
  }
  return due.length
}
