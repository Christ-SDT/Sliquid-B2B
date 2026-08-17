import { db } from './database.js'
import { parseSize } from './rewardOptions.js'

/**
 * Packshot catalog — the read layer behind the MCP product-image tools.
 *
 * Packshots are rows in the existing `media` table with `type = 'packshot'`
 * plus the catalog columns added in migration v56 (sku, unit_size,
 * package_version, packshot_status, approved, sha256, asset_key).
 *
 * TWO INVARIANTS THIS MODULE EXISTS TO ENFORCE
 *
 * 1. ONLY `type='packshot' AND approved=1` ROWS ARE EVER RETURNED.
 *    An unapproved packshot must be invisible to *everything*, including an
 *    exact asset_id lookup — "unlisted but reachable if you know the id" is not
 *    the contract. The predicate lives in the private `HARD_FILTER` constant
 *    below, is concatenated into every statement in this file, and takes no
 *    parameter, so no caller argument can widen or disable it.
 *
 * 2. NO PII. This module selects from `media` and `products` only. It must
 *    never join or read `users`, `cert_rewards`, or anything else carrying
 *    personal data — the whole point is that it is safe to expose to an agent.
 *    `file_url` is deliberately not selected either: handing out bytes is a
 *    separate concern owned by another module.
 *
 * ⚠️ Sizes are matched NUMERICALLY, never by string equality — see
 * `rewardOptions.parseSize`. The real catalog contains '4.2 oz' and '8.5 oz'
 * (there is no literal '4 oz' or '8 oz') and spells the same size two ways
 * ('2 oz' and '2.0 oz'). A caller asking for "4 oz" must find "4.2 oz", so
 * size filtering happens in JS against parsed numbers, not in SQL.
 */

export type PackshotStatus = 'active' | 'discontinued' | 'pending_approval'

export interface PackshotRecord {
  asset_id: string          // from media.asset_key
  media_id: number
  sku: string | null
  product: string           // display name; prefer products.name, else media.label
  size: string | null
  package_version: string | null
  status: PackshotStatus
  brand: string
  category: string | null
  upc: string | null
  filename: string
  mime_type: string
  s3_key: string
  sha256: string | null
}

export interface SearchOptions {
  product: string
  size?: string
  includeInactive?: boolean   // default false
  limit?: number              // default 25, hard cap 50
}

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50
/** How far from the requested size a packshot may sit and still match, in oz. */
const OZ_TOLERANCE = 1

const VALID_STATUSES: readonly PackshotStatus[] = ['active', 'discontinued', 'pending_approval']

/**
 * The non-negotiable predicate. Constant text, zero parameters — there is no
 * argument any exported function can pass that removes it.
 */
const HARD_FILTER = "m.type = 'packshot' AND m.approved = 1"

/**
 * A row with no explicit packshot_status is treated as 'active': an admin has
 * already approved it, so it should not silently vanish from the default feed
 * just because the ingest did not stamp a status.
 */
const STATUS_SQL = "COALESCE(m.packshot_status, 'active')"

/**
 * media.unit_size is the packshot's own retail size; fall back to the linked
 * product's size when the media row does not carry one.
 */
const SIZE_SQL = 'COALESCE(m.unit_size, p.unit_size)'

/**
 * Free-text haystack for product token matching. Lowercased in SQL so the LIKE
 * comparison is case-insensitive for non-ASCII too (SQLite's LIKE is only
 * case-insensitive for ASCII by default).
 */
const HAYSTACK_SQL = `LOWER(
  COALESCE(p.name, '') || ' ' || COALESCE(m.label, '') || ' ' ||
  COALESCE(m.brand, '') || ' ' || COALESCE(p.brand, '') || ' ' ||
  COALESCE(m.sku, '')
)`

/**
 * Note the explicit column list: `products` carries no PII, but selecting `p.*`
 * would silently start leaking any column a future migration adds.
 */
const SELECT_SQL = `
  SELECT
    m.asset_key                              AS asset_id,
    m.id                                     AS media_id,
    m.sku                                    AS sku,
    COALESCE(p.name, m.label, '')            AS product,
    ${SIZE_SQL}                              AS size,
    m.package_version                        AS package_version,
    ${STATUS_SQL}                            AS status,
    COALESCE(m.brand, p.brand, 'Sliquid')    AS brand,
    p.category                               AS category,
    p.upc                                    AS upc,
    m.filename                               AS filename,
    COALESCE(m.mime_type, 'application/octet-stream') AS mime_type,
    m.s3_key                                 AS s3_key,
    m.sha256                                 AS sha256
  FROM media m
  LEFT JOIN products p ON p.sku = m.sku
`

/** Active first, then pending, then discontinued; stable within each bucket. */
const ORDER_SQL = `
  ORDER BY
    CASE ${STATUS_SQL}
      WHEN 'active' THEN 0
      WHEN 'pending_approval' THEN 1
      ELSE 2
    END,
    LOWER(COALESCE(m.brand, p.brand, '')),
    LOWER(COALESCE(p.name, m.label, '')),
    m.id
`

interface RawRow {
  asset_id: string | null
  media_id: number
  sku: string | null
  product: string
  size: string | null
  package_version: string | null
  status: string | null
  brand: string
  category: string | null
  upc: string | null
  filename: string
  mime_type: string
  s3_key: string
  sha256: string | null
}

function toStatus(value: string | null): PackshotStatus {
  return VALID_STATUSES.includes(value as PackshotStatus)
    ? (value as PackshotStatus)
    : 'active'
}

function toRecord(row: RawRow): PackshotRecord {
  return {
    asset_id: row.asset_id ?? '',
    media_id: row.media_id,
    sku: row.sku,
    product: row.product,
    size: row.size,
    package_version: row.package_version,
    status: toStatus(row.status),
    brand: row.brand,
    category: row.category,
    upc: row.upc,
    filename: row.filename,
    mime_type: row.mime_type,
    s3_key: row.s3_key,
    sha256: row.sha256,
  }
}

/**
 * 'Sliquid H2O 4.2oz!' -> ['sliquid', 'h2o', '4', '2oz'].
 *
 * Stripping everything that is not alphanumeric is what makes token matching
 * order-independent and punctuation-tolerant. It also means a token can never
 * contain a LIKE wildcard ('%', '_') or a quote, so a caller cannot smuggle a
 * pattern — or SQL — through the search box. Values are bound as parameters
 * regardless; this is belt and braces.
 */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 0)
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT
  const n = Math.floor(limit)
  if (n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

/**
 * Does `rowSize` satisfy a caller asking for `requested`?
 *
 * Numeric when both parse ('4 oz' matches '4.2 oz' within ±1 oz); otherwise a
 * trimmed, case-insensitive string comparison so non-numeric sizes such as
 * 'travel' still work.
 */
function sizeMatches(rowSize: string | null, requested: string): boolean {
  const wanted = parseSize(requested)
  if (wanted !== null) {
    const actual = parseSize(rowSize)
    return actual !== null && Math.abs(actual - wanted) <= OZ_TOLERANCE
  }
  if (!rowSize) return false
  return rowSize.trim().toLowerCase() === requested.trim().toLowerCase()
}

/**
 * Search approved packshots by product name.
 *
 * Defaults to `packshot_status = 'active'`. Pass `includeInactive: true` to
 * also surface discontinued / pending rows, so the agent can answer "that one
 * is discontinued" instead of the less useful "not found".
 *
 * A `product` string that contains no alphanumeric characters matches nothing
 * — returning the entire catalog for garbage input would be worse than empty.
 */
export function searchPackshots(opts: SearchOptions): PackshotRecord[] {
  const tokens = tokenize(opts.product ?? '')
  if (tokens.length === 0) return []

  const limit = clampLimit(opts.limit)

  const where: string[] = [HARD_FILTER]
  const params: unknown[] = []

  if (!opts.includeInactive) {
    where.push(`${STATUS_SQL} = 'active'`)
  }
  for (const token of tokens) {
    where.push(`${HAYSTACK_SQL} LIKE ?`)
    params.push(`%${token}%`)
  }

  const rows = db
    .prepare(`${SELECT_SQL} WHERE ${where.join(' AND ')} ${ORDER_SQL}`)
    .all(...params) as RawRow[]

  // Size filtering is deliberately NOT in SQL: '4 oz' has to match '4.2 oz',
  // which needs numeric parsing. Filter first, then apply the limit, so a
  // size-narrowed search still returns up to `limit` results.
  const size = opts.size?.trim()
  const filtered = size ? rows.filter(r => sizeMatches(r.size, size)) : rows

  return filtered.slice(0, limit).map(toRecord)
}

/**
 * Exact lookup by the public asset id (media.asset_key).
 *
 * Returns any status — a direct id lookup on a discontinued packshot is a
 * legitimate question — but still only approved packshot rows. An unapproved
 * row is a 'not found' here, exactly as it is in search.
 */
export function getPackshotByAssetId(assetId: string): PackshotRecord | null {
  const key = assetId?.trim()
  if (!key) return null

  const row = db
    .prepare(`${SELECT_SQL} WHERE ${HARD_FILTER} AND m.asset_key = ? LIMIT 1`)
    .get(key) as RawRow | undefined

  return row ? toRecord(row) : null
}

/**
 * Distinct sizes we hold an approved packshot for, ascending.
 *
 * Deduped numerically, so the catalog's '2 oz' / '2.0 oz' double-spelling
 * yields one entry (the first spelling seen) rather than two. Unparseable
 * sizes are kept and deduped case-insensitively, sorted last.
 */
export function listPackshotSizes(sku: string): string[] {
  const key = sku?.trim()
  if (!key) return []

  const rows = db
    .prepare(`
      SELECT DISTINCT ${SIZE_SQL} AS size
      FROM media m
      LEFT JOIN products p ON p.sku = m.sku
      WHERE ${HARD_FILTER} AND m.sku = ? AND ${SIZE_SQL} IS NOT NULL
    `)
    .all(key) as { size: string | null }[]

  const seen = new Set<string>()
  const out: { label: string; oz: number | null }[] = []

  for (const r of rows) {
    const label = r.size?.trim()
    if (!label) continue
    const oz = parseSize(label)
    const dedupeKey = oz !== null ? `n:${oz}` : `s:${label.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({ label, oz })
  }

  out.sort((a, b) => {
    if (a.oz !== null && b.oz !== null) return a.oz - b.oz
    if (a.oz !== null) return -1
    if (b.oz !== null) return 1
    return a.label.localeCompare(b.label)
  })

  return out.map(x => x.label)
}
