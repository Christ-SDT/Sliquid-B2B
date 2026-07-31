/**
 * WordPress → Announcements sync.
 *
 * Pulls posts from the WordPress "Press Releases" category into the local
 * `announcements` table. WordPress is read-only: we never write back.
 *
 * This file is deliberately split in two halves:
 *   1. PURE FUNCTIONS — no network, no DB, no clock. All the content mangling
 *      (Elementor unwrapping, standalone-document extraction, URL
 *      absolutization, slugs, timestamps) lives here so it can be unit-tested
 *      against fixtures with zero mocks. These are the bug-prone parts.
 *   2. SERVICE + SYNC — the thin I/O layer.
 *
 * Modelled on woocommerce.ts (same config-resolution / isConfigured /
 * testConnection / runXSync shape).
 */

import { db } from './database.js'
import { notifyAdmins } from './notifications.js'
import { sweepScheduledAnnouncements } from './announcements.js'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface WPConfig {
  /** e.g. 'https://sliquid.com' — no trailing slash, no /wp-json */
  baseUrl: string
  /** Press Releases = 245 */
  categoryId: number
  /** 'YYYY-MM-DD'; posts published before this are never imported */
  cutoffDate: string
  /** Only needed to see future/pending posts; unused in v1 */
  auth?: { user: string; password: string }
}

export interface WPPost {
  id: number
  slug?: string
  link?: string
  status?: string
  date?: string
  date_gmt?: string
  modified?: string
  modified_gmt?: string
  title?: { rendered?: string }
  excerpt?: { rendered?: string }
  content?: { rendered?: string }
  featured_media?: number
  jetpack_featured_media_url?: string | null
  categories?: number[]
}

export type ContentShape = 'document' | 'rich'

export interface NormalizedContent {
  html: string
  shape: ContentShape
  css: string | null
}

export interface AnnouncementSyncRow {
  wp_id: number
  wp_slug: string | null
  wp_link: string | null
  wp_status: string | null
  wp_date: string | null
  wp_date_gmt: string | null
  wp_modified: string | null
  wp_modified_gmt: string | null
  wp_title: string
  wp_excerpt_html: string | null
  wp_content_html: string | null
  wp_featured_image_url: string | null
  wp_categories: string | null
  content_shape: ContentShape
  content_css: string | null
  slug: string
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PURE FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', trade: '™', reg: '®', copy: '©', deg: '°',
}

/** Decode the HTML entities WordPress puts in `title.rendered`. */
export function decodeEntities(input: string): string {
  if (!input) return ''
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = NAMED_ENTITIES[String(name).toLowerCase()]
      return v ?? m
    })
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try { return String.fromCodePoint(code) } catch { return '' }
}

/** Strip all tags, collapse whitespace. Used for plain-text titles/excerpts. */
export function stripTags(input: string): string {
  if (!input) return ''
  return decodeEntities(input.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Elementor wraps post content in several nested single-child `<div>`s that are
 * meaningless without Elementor's own CSS. Peel them off.
 *
 * Uses depth tracking rather than a naive regex: it only unwraps when the
 * opening div's matching close tag is the very last thing in the string, i.e.
 * when the div genuinely wraps ALL the content. That makes it safe to run
 * repeatedly and impossible to mangle sibling markup.
 */
export function stripElementorWrapper(html: string): string {
  let current = (html ?? '').trim()
  // Real fixtures nest ~5 deep; 12 is a generous bound that also guards against
  // a pathological input spinning this loop.
  for (let i = 0; i < 12; i++) {
    const next = unwrapOuterElementorDiv(current)
    if (next === null) break
    current = next.trim()
  }
  return current
}

function unwrapOuterElementorDiv(html: string): string | null {
  const open = /^<div\b([^>]*)>/i.exec(html)
  if (!open) return null

  const attrs = open[1]
  const isElementor =
    /data-elementor/i.test(attrs) ||
    /class\s*=\s*("|')[^"']*(?:\belementor|\be-con\b|\be-parent\b|\be-child\b)/i.test(attrs)
  if (!isElementor) return null

  // Walk div open/close tags to find the one that closes this wrapper.
  const tagRe = /<(\/?)div\b[^>]*>/gi
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[1] ? -1 : 1
    if (depth === 0) {
      // Only a wrapper if nothing follows its closing tag.
      if (html.slice(tagRe.lastIndex).trim() !== '') return null
      return html.slice(open[0].length, m.index)
    }
  }
  return null
}

/**
 * Detect the "author pasted a whole HTML document into an Elementor HTML
 * widget" shape and slice the real document out of whatever surrounds it.
 *
 * ⚠️ Slicing matters: if any markup precedes `<!DOCTYPE html>`, a browser
 * renders the document in QUIRKS MODE — different box model, line-height and
 * percentage heights — silently breaking the author's design. The client
 * renderer re-does this defensively; we also do it here so what we store is
 * already clean.
 */
export function extractStandaloneDoc(html: string): {
  isStandalone: boolean
  doc: string
  css: string | null
} {
  const src = html ?? ''
  const start = src.search(/<!doctype\s+html|<html[\s>]/i)
  const closeIdx = src.toLowerCase().lastIndexOf('</html>')

  if (start >= 0 && closeIdx > start) {
    const doc = src.slice(start, closeIdx + '</html>'.length)
    return { isStandalone: true, doc, css: extractStyleBlocks(doc) }
  }

  // A `<style>` block with no document wrapper still carries global CSS
  // (`body {}`, `* {}`, `:root {}`) that would leak into the host page, so it
  // needs the same isolation treatment.
  const css = extractStyleBlocks(src)
  if (css) return { isStandalone: true, doc: src, css }

  return { isStandalone: false, doc: src, css: null }
}

/** Concatenated contents of every `<style>` block, or null if there are none. */
export function extractStyleBlocks(html: string): string | null {
  const out: string[] = []
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html ?? '')) !== null) out.push(m[1].trim())
  const joined = out.join('\n\n').trim()
  return joined.length ? joined : null
}

/**
 * Remove genuinely dangerous markup. Defence in depth only — Shape A renders in
 * an iframe sandboxed WITHOUT allow-scripts, so scripts are already inert.
 *
 * Deliberately KEPT: `<style>` (it is the author's design), `<meta>` (charset /
 * viewport), and `<link>` (authors legitimately pull Google Fonts, which the
 * marketing CSP already allows via style-src/font-src). Removing those would
 * break valid designs for no security gain given the sandbox.
 */
export function stripUnsafeMarkup(html: string): string {
  return (html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<(object|embed|applet)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(object|embed|applet)\b[^>]*\/?>/gi, '')
    // inline event handlers: on*="…" | on*='…' | on*=bare
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // javascript: URLs in href/src/action
    .replace(/\b(href|src|action)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/\b(href|src|action)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
}

const SKIP_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

/** Resolve one URL against the WP base, leaving anything already absolute alone. */
export function absolutizeUrl(url: string, baseUrl: string): string {
  const v = (url ?? '').trim()
  if (!v || SKIP_URL.test(v)) return url
  try {
    return new URL(v, baseUrl.replace(/\/+$/, '') + '/').toString()
  } catch {
    return url
  }
}

/**
 * Rewrite root-relative and relative `src` / `href` / `srcset` values to
 * absolute URLs on the WordPress host, so images and links still resolve when
 * the body is rendered on a different origin.
 */
export function absolutizeUrls(html: string, baseUrl: string): string {
  if (!html) return html

  const attr = (name: string) =>
    new RegExp(`(\\s${name}\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'gi')

  let out = html
  for (const name of ['src', 'href', 'poster']) {
    out = out.replace(attr(name), (_m, lead, _q, dq, sq) => {
      const raw = dq !== undefined ? dq : sq
      const quote = dq !== undefined ? '"' : "'"
      return `${lead}${quote}${absolutizeUrl(raw, baseUrl)}${quote}`
    })
  }

  // srcset is a comma-separated list of "url [descriptor]" candidates.
  out = out.replace(attr('srcset'), (_m, lead, _q, dq, sq) => {
    const raw = dq !== undefined ? dq : sq
    const quote = dq !== undefined ? '"' : "'"
    const rebuilt = raw
      .split(',')
      .map((part: string) => {
        const t = part.trim()
        if (!t) return ''
        const [url, ...rest] = t.split(/\s+/)
        return [absolutizeUrl(url, baseUrl), ...rest].join(' ')
      })
      .filter(Boolean)
      .join(', ')
    return `${lead}${quote}${rebuilt}${quote}`
  })

  return out
}

/**
 * The full WP-content pipeline: unwrap Elementor → detect/extract a standalone
 * document → strip dangerous markup → absolutize URLs.
 */
export function normalizeWpContent(rawHtml: string, baseUrl: string): NormalizedContent {
  const unwrapped = stripElementorWrapper(rawHtml ?? '')
  const { isStandalone, doc, css } = extractStandaloneDoc(unwrapped)
  const safe = stripUnsafeMarkup(doc)
  const html = absolutizeUrls(safe, baseUrl)
  return {
    html,
    shape: isStandalone ? 'document' : 'rich',
    // Re-extract from the sanitized copy so stored CSS matches what renders.
    css: isStandalone ? (extractStyleBlocks(html) ?? css) : null,
  }
}

/**
 * Path segments the announcements router uses as literals. A post titled
 * "Admin" must not claim a slug that shadows `/api/announcements/admin`.
 */
export const RESERVED_SLUGS = new Set(['public', 'admin', 'sync', 'new', 'edit'])

export function slugify(input: string): string {
  const base = stripTags(input ?? '')
    .toLowerCase()
    .replace(/['‘’"“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')

  if (!base) return 'announcement'
  return RESERVED_SLUGS.has(base) ? `${base}-announcement` : base
}

/** First free slug in the chain base, base-2, base-3, … */
export function uniqueSlug(base: string, taken: (candidate: string) => boolean): string {
  const root = slugify(base)
  if (!taken(root)) return root
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`
    if (!taken(candidate)) return candidate
  }
  return `${root}-${Date.now()}`
}

/**
 * Normalize any timestamp to SQLite's own format, `'YYYY-MM-DD HH:MM:SS'` UTC.
 *
 * ⚠️ This is load-bearing. Visibility compares `publish_at <= datetime('now')`
 * lexicographically, and an ISO string's `'T'` (0x54) sorts AFTER a space
 * (0x20) — so storing `'2026-07-31T16:00:00Z'` makes an item scheduled earlier
 * today read as still-in-the-future and it never goes live.
 *
 * @param assumeUtc treat a zone-less input as UTC. WordPress `*_gmt` fields are
 *   UTC but carry no `Z`, and `new Date()` would otherwise read them as local.
 * @returns normalized string | null to clear the field | undefined if invalid
 *   (callers should turn `undefined` into a 400).
 */
export function normalizeTs(input: unknown, assumeUtc = false): string | null | undefined {
  if (input === null || input === undefined || input === '') return null
  if (typeof input !== 'string' && !(input instanceof Date)) return undefined

  let value: string
  if (input instanceof Date) {
    value = input.toISOString()
  } else {
    value = input.trim()
    if (!value) return null
    // Zone-less "2026-07-08T21:51:39" or "2026-07-08 21:51:39"
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    if (assumeUtc && !hasZone) value = value.replace(' ', 'T') + 'Z'
  }

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/** True when a WP publish date is on/after the configured cutoff. */
export function isAfterCutoff(dateGmt: string | null | undefined, cutoffDate: string): boolean {
  const norm = normalizeTs(dateGmt, true)
  if (!norm) return false
  const cutoff = normalizeTs(`${cutoffDate}T00:00:00Z`) ?? `${cutoffDate} 00:00:00`
  return norm >= cutoff
}

/**
 * Rewind a watermark by N minutes so a post edited mid-run is not skipped on the
 * next pass. Re-importing is free because the upsert is idempotent.
 *
 * Operates on the site-local `modified` value verbatim: WordPress filters
 * `modified_after` against site-local `post_modified`, so mixing in a GMT value
 * here would shift the window by the site's UTC offset and silently skip posts.
 */
export function overlapWatermark(localTs: string, minutes: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec((localTs ?? '').trim())
  if (!m) return localTs

  // Wall-clock arithmetic ONLY. Parsing with `new Date(naiveString)` and
  // formatting with toISOString() would convert through the server's local
  // zone and shift the watermark by its UTC offset — corrupting a value that
  // WordPress compares against site-local post_modified.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  d.setUTCMinutes(d.getUTCMinutes() - minutes)
  return d.toISOString().slice(0, 19)
}

export const WP_FIELDS = [
  'id', 'slug', 'date', 'date_gmt', 'modified', 'modified_gmt', 'status', 'link',
  'title', 'excerpt', 'content', 'featured_media', 'jetpack_featured_media_url',
  'categories',
].join(',')

export function buildPostsUrl(
  cfg: WPConfig,
  opts: { page: number; perPage?: number; modifiedAfter?: string | null },
): string {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const p = new URLSearchParams({
    categories: String(cfg.categoryId),
    per_page: String(Math.min(opts.perPage ?? 100, 100)),
    page: String(opts.page),
    // Ascending so a mid-run failure cannot commit a watermark past posts we
    // never imported — the next run resumes from where this one stopped.
    orderby: 'modified',
    order: 'asc',
    after: `${cfg.cutoffDate}T00:00:00`,
    _fields: WP_FIELDS,
  })
  if (opts.modifiedAfter) p.set('modified_after', opts.modifiedAfter)
  return `${base}/wp-json/wp/v2/posts?${p.toString()}`
}

/**
 * Translate a WP post into the row shape we store. Pure — no DB, no clock — so
 * the whole translation is testable against a fixture.
 *
 * `slug` here is only a *proposal*; the caller resolves collisions with
 * uniqueSlug() and uses it on INSERT only, never on update.
 */
export function mapPostToRow(post: WPPost, cfg: WPConfig): AnnouncementSyncRow {
  const title = decodeEntities(stripTags(post.title?.rendered ?? '')) || `Post ${post.id}`
  const content = normalizeWpContent(post.content?.rendered ?? '', cfg.baseUrl)
  const excerpt = post.excerpt?.rendered
    ? absolutizeUrls(stripUnsafeMarkup(post.excerpt.rendered), cfg.baseUrl)
    : null

  return {
    wp_id: post.id,
    wp_slug: post.slug ?? null,
    wp_link: post.link ?? null,
    wp_status: post.status ?? null,
    wp_date: post.date ?? null,
    wp_date_gmt: normalizeTs(post.date_gmt ?? post.date, true) ?? null,
    wp_modified: post.modified ?? null,
    wp_modified_gmt: normalizeTs(post.modified_gmt ?? post.modified, true) ?? null,
    wp_title: title,
    wp_excerpt_html: excerpt,
    wp_content_html: content.html,
    wp_featured_image_url: post.jetpack_featured_media_url
      ? absolutizeUrl(post.jetpack_featured_media_url, cfg.baseUrl)
      : null,
    wp_categories: JSON.stringify(post.categories ?? []),
    content_shape: content.shape,
    content_css: content.css,
    slug: slugify(post.slug || title),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. SERVICE + SYNC
// ══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_WP_BASE_URL = 'https://sliquid.com'
export const DEFAULT_PRESS_CATEGORY_ID = 245        // "Press Releases"
export const DEFAULT_CUTOFF_DATE = '2025-01-01'

const SETTING_BASE_URL = 'wp_base_url'
const SETTING_CATEGORY = 'wp_category_id'
const SETTING_CUTOFF = 'wp_cutoff_date'
const SETTING_ENABLED = 'wp_announcements_sync_enabled'
const SETTING_WATERMARK = 'wp_last_sync_modified'

/** Read one key from the shared woo_settings key/value table. */
export function getSetting(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM woo_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  } catch {
    // Table may not exist yet (before migrations run)
    return null
  }
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)').run(key, value)
}

/** Strip trailing slashes and an accidental /wp-json suffix. */
function cleanBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/wp-json$/i, '')
}

export class WordPressService {
  /**
   * Resolution order, env first then DB, terminating in a hardcoded default so
   * the feature is never dead on arrival.
   *
   * WC_URL is only a late fallback on purpose: it points at the same WordPress
   * install, but coupling press releases to WooCommerce credentials would mean
   * rotating or removing Woo silently breaks announcements.
   */
  getConfig(): WPConfig {
    const baseUrl = cleanBaseUrl(
      process.env.WP_BASE_URL ||
      getSetting(SETTING_BASE_URL) ||
      process.env.WC_URL ||
      getSetting('wc_url') ||
      DEFAULT_WP_BASE_URL,
    )

    const rawCat = process.env.WP_ANNOUNCEMENTS_CATEGORY_ID || getSetting(SETTING_CATEGORY)
    const parsedCat = rawCat ? parseInt(rawCat, 10) : NaN
    const categoryId = Number.isFinite(parsedCat) && parsedCat > 0
      ? parsedCat
      : DEFAULT_PRESS_CATEGORY_ID

    const rawCutoff = process.env.WP_ANNOUNCEMENTS_CUTOFF || getSetting(SETTING_CUTOFF)
    const cutoffDate = rawCutoff && /^\d{4}-\d{2}-\d{2}$/.test(rawCutoff.trim())
      ? rawCutoff.trim()
      : DEFAULT_CUTOFF_DATE

    const user = process.env.WP_APP_USER
    const password = process.env.WP_APP_PASSWORD

    return {
      baseUrl,
      categoryId,
      cutoffDate,
      ...(user && password ? { auth: { user, password } } : {}),
    }
  }

  /** Always true — getConfig() terminates in defaults. Kept for API symmetry. */
  isConfigured(): boolean {
    return !!this.getConfig().baseUrl
  }

  /**
   * Kill switch for the scheduled pull. Because isConfigured() is always true,
   * this is what actually gates the background sync.
   */
  isSyncEnabled(): boolean {
    return getSetting(SETTING_ENABLED) !== '0'
  }

  getWatermark(): string | null {
    return getSetting(SETTING_WATERMARK)
  }

  private authHeaders(cfg: WPConfig): Record<string, string> {
    if (!cfg.auth) return {}
    const basic = Buffer.from(`${cfg.auth.user}:${cfg.auth.password}`).toString('base64')
    return { Authorization: `Basic ${basic}` }
  }

  /** Never throws — mirrors woo.testConnection(). */
  async testConnection(): Promise<{ ok: boolean; error?: string; total?: number }> {
    const cfg = this.getConfig()
    try {
      const url = buildPostsUrl(cfg, { page: 1, perPage: 1 })
      const res = await fetch(url, { headers: this.authHeaders(cfg) })
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} — check the WordPress URL and category id` }
      }
      const total = parseInt(res.headers.get('x-wp-total') ?? '0', 10)
      return { ok: true, total: Number.isFinite(total) ? total : 0 }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Connection failed' }
    }
  }

  /**
   * Fetch every Press Release page. Paginates on X-WP-TotalPages rather than
   * looping until an empty page, because WordPress returns HTTP 400
   * (rest_post_invalid_page_number) past the last page.
   */
  async fetchPosts(opts: { modifiedAfter?: string | null } = {}): Promise<WPPost[]> {
    const cfg = this.getConfig()
    const headers = this.authHeaders(cfg)
    const all: WPPost[] = []
    let page = 1
    let totalPages = 1

    do {
      const url = buildPostsUrl(cfg, { page, perPage: 100, modifiedAfter: opts.modifiedAfter })
      const res = await fetch(url, { headers })
      if (!res.ok) {
        throw new Error(`WordPress API error: HTTP ${res.status}`)
      }
      const batch = (await res.json()) as WPPost[]
      if (!Array.isArray(batch)) throw new Error('WordPress API returned an unexpected payload')
      all.push(...batch)

      if (page === 1) {
        const tp = parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10)
        totalPages = Number.isFinite(tp) && tp > 0 ? tp : 1
      }
      page++
    } while (page <= totalPages && page <= 50) // hard bound against a runaway header

    return all
  }
}

export const wp = new WordPressService()

export type UpsertOutcome = 'created' | 'updated' | 'unchanged' | 'skipped'

function slugTaken(candidate: string): boolean {
  return !!db.prepare('SELECT 1 FROM announcements WHERE slug = ?').get(candidate)
}

/**
 * Insert or refresh one WordPress post.
 *
 * ⚠️ THE ANTI-CLOBBER CONTRACT: the UPDATE branch touches ONLY `wp_*` columns
 * plus content_shape/content_css/last_synced_at. It must never mention slug,
 * status, publish_at, expires_at, show_in_portal, show_on_public, pinned,
 * sort_order, notified_at, admin_notes, any *_override, created_by or
 * first_seen_at — those are the admin's, and overwriting them would silently
 * unpublish or un-customize an announcement on the next pull.
 *
 * New rows land hidden and invisible on both surfaces, so nothing appears
 * anywhere until an admin explicitly publishes it.
 */
export function upsertFromWpPost(post: WPPost, cfg: WPConfig): UpsertOutcome {
  if (!post?.id) return 'skipped'

  // Belt-and-braces: WordPress already filters by `after`, but never import
  // something older than the cutoff even if the query changes.
  if (!isAfterCutoff(post.date_gmt ?? post.date, cfg.cutoffDate)) return 'skipped'
  if (cfg.categoryId && post.categories && !post.categories.includes(cfg.categoryId)) {
    return 'skipped'
  }

  const row = mapPostToRow(post, cfg)
  const existing = db.prepare(
    'SELECT id, wp_modified FROM announcements WHERE wp_id = ?'
  ).get(row.wp_id) as { id: number; wp_modified: string | null } | undefined

  if (existing) {
    db.prepare(`
      UPDATE announcements SET
        wp_slug               = ?,
        wp_link               = ?,
        wp_status             = ?,
        wp_date               = ?,
        wp_date_gmt           = ?,
        wp_modified           = ?,
        wp_modified_gmt       = ?,
        wp_title              = ?,
        wp_excerpt_html       = ?,
        wp_content_html       = ?,
        wp_featured_image_url = ?,
        wp_categories         = ?,
        content_shape         = ?,
        content_css           = ?,
        last_synced_at        = datetime('now')
      WHERE wp_id = ?
    `).run(
      row.wp_slug, row.wp_link, row.wp_status, row.wp_date, row.wp_date_gmt,
      row.wp_modified, row.wp_modified_gmt, row.wp_title, row.wp_excerpt_html,
      row.wp_content_html, row.wp_featured_image_url, row.wp_categories,
      row.content_shape, row.content_css, row.wp_id,
    )
    return existing.wp_modified === row.wp_modified ? 'unchanged' : 'updated'
  }

  db.prepare(`
    INSERT INTO announcements (
      source, wp_id, wp_slug, wp_link, wp_status, wp_date, wp_date_gmt,
      wp_modified, wp_modified_gmt, wp_title, wp_excerpt_html, wp_content_html,
      wp_featured_image_url, wp_categories, content_shape, content_css,
      slug, status, show_in_portal, show_on_public,
      first_seen_at, last_synced_at
    ) VALUES (
      'wordpress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, 'hidden', 0, 0,
      datetime('now'), datetime('now')
    )
  `).run(
    row.wp_id, row.wp_slug, row.wp_link, row.wp_status, row.wp_date, row.wp_date_gmt,
    row.wp_modified, row.wp_modified_gmt, row.wp_title, row.wp_excerpt_html,
    row.wp_content_html, row.wp_featured_image_url, row.wp_categories,
    row.content_shape, row.content_css,
    uniqueSlug(row.slug, slugTaken),
  )
  return 'created'
}

export interface AnnouncementSyncResult {
  status: 'ok' | 'error'
  posts_seen: number
  posts_created: number
  posts_updated: number
  posts_skipped: number
  duration_ms: number
  message?: string
}

/**
 * Pull Press Releases into `announcements`.
 *
 * Resolves rather than rejecting (same contract as runWooSync) and always
 * writes exactly one announcement_sync_log row.
 *
 * The watermark advances ONLY on success, and is rewound by a 5-minute overlap
 * so a post edited mid-run is not skipped next time — re-importing is free
 * because the upsert is idempotent.
 */
export async function runAnnouncementSync(
  trigger: 'schedule' | 'manual' | 'boot' = 'schedule',
): Promise<AnnouncementSyncResult> {
  const startedAt = Date.now()
  const cfg = wp.getConfig()
  let seen = 0, created = 0, updated = 0, skipped = 0

  try {
    const posts = await wp.fetchPosts({ modifiedAfter: wp.getWatermark() })
    seen = posts.length

    let maxModified: string | null = null
    for (const post of posts) {
      switch (upsertFromWpPost(post, cfg)) {
        case 'created': created++; break
        case 'updated': updated++; break
        case 'skipped': skipped++; break
      }
      if (post.modified && (!maxModified || post.modified > maxModified)) {
        maxModified = post.modified
      }
    }

    if (maxModified) setSetting(SETTING_WATERMARK, overlapWatermark(maxModified, 5))

    const duration = Date.now() - startedAt
    db.prepare(`
      INSERT INTO announcement_sync_log
        (trigger_source, status, posts_seen, posts_created, posts_updated, posts_skipped, duration_ms, message)
      VALUES (?, 'ok', ?, ?, ?, ?, ?, ?)
    `).run(
      trigger, seen, created, updated, skipped, duration,
      `Synced ${seen} WordPress posts (${created} new, ${updated} updated, ${skipped} skipped)`,
    )

    // New posts land hidden — tell admins there is something to review.
    if (created > 0) {
      notifyAdmins(
        'announcement_review',
        'New press releases to review',
        `${created} new press release${created === 1 ? '' : 's'} imported and hidden.`,
        '/admin/announcements',
      )
    }

    // Anything that crossed its publish time (including a just-imported post an
    // admin had already scheduled) gets announced now.
    sweepScheduledAnnouncements()

    return {
      status: 'ok',
      posts_seen: seen,
      posts_created: created,
      posts_updated: updated,
      posts_skipped: skipped,
      duration_ms: duration,
    }
  } catch (e: any) {
    const message = e?.message ?? 'Unknown error'
    const duration = Date.now() - startedAt
    // Watermark deliberately untouched, so the next run retries this window.
    db.prepare(`
      INSERT INTO announcement_sync_log
        (trigger_source, status, posts_seen, posts_created, posts_updated, posts_skipped, duration_ms, message)
      VALUES (?, 'error', ?, ?, ?, ?, ?, ?)
    `).run(trigger, seen, created, updated, skipped, duration, message)

    return {
      status: 'error',
      posts_seen: seen,
      posts_created: created,
      posts_updated: updated,
      posts_skipped: skipped,
      duration_ms: duration,
      message,
    }
  }
}
