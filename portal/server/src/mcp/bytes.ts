import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'crypto'
import type { Readable } from 'stream'
import type { PackshotRecord } from '../packshots.js'

/**
 * Byte loader for approved packshots.
 *
 * Every packshot that leaves this process is checksum-verified against the
 * `sha256` recorded in the database at ingest time. The brand handoff is
 * explicit: a file whose bytes no longer match its recorded digest must be
 * WITHHELD, not served with a warning. A tampered or truncated packshot is
 * indistinguishable from an approved one to a downstream model, so the only
 * safe response is to fail closed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TODO(iam): REMOVE THE PUBLIC-HTTPS FALLBACK ONCE `s3:GetObject` IS GRANTED.
 *
 * The IAM principal this server runs as can `PutObject` but not `GetObject`, so
 * `GetObjectCommand` returns 403 for every packshot. Verified against production
 * 2026-08-17: `packshots/*`, `product-shots/*` and `portal-assets/*` all deny,
 * INCLUDING a prefix the bucket policy explicitly grants that user — so the cap
 * is an IAM permissions boundary (or an explicit Deny / SCP), not the bucket
 * policy, and no bucket-policy edit can lift it. Anonymous HTTPS reads return
 * 200 because the bucket policy grants `s3:GetObject` to `Principal: "*"`.
 *
 * So `fetchPublicObject` below reads the same object over plain HTTPS when — and
 * only when — the signed call fails with a permission error. This is a stopgap,
 * not the intended architecture: it makes retrieval depend on the bucket staying
 * publicly readable. When the IAM grant lands, delete the fallback and this note.
 *
 * What the stopgap does NOT weaken: the checksum gate. Verification happens on
 * whatever buffer arrives, after the fetch, so tamper protection is identical on
 * both transports. Only the "we could make this bucket private later" property
 * is on loan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── S3 helper ────────────────────────────────────────────────────────────────
//
// Duplicated from routes/assets.ts on purpose — the codebase already keeps a
// private copy of this helper in each module that touches S3 rather than
// importing across route files. Do not "DRY" this by importing from a router:
// that would drag Express route registration into the MCP module graph.

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown when the fetched bytes do not hash to the recorded digest. */
export class ChecksumMismatchError extends Error {
  constructor(
    readonly assetId: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Checksum mismatch for asset ${assetId} — expected sha256 ${expected}, got ${actual}. ` +
        'The asset was withheld.',
    )
    this.name = 'ChecksumMismatchError'
  }
}

/** Thrown when a record carries no digest at all — we never serve unverified bytes. */
export class UnverifiableAssetError extends Error {
  constructor(readonly assetId: string) {
    super(
      `Asset ${assetId} has no recorded sha256 checksum, so its integrity cannot be verified. ` +
        'The asset was withheld.',
    )
    this.name = 'UnverifiableAssetError'
  }
}

// ─── In-process LRU cache ─────────────────────────────────────────────────────
//
// Keyed by s3_key + sha256 so a re-ingested file (new digest, same key) can
// never be served from a stale entry. Small on purpose: compositing fetches the
// same packshot several times in a row, but this process is not a CDN.

const CACHE_MAX = 20
const cache = new Map<string, Buffer>()

function cacheKey(rec: PackshotRecord): string {
  return `${rec.s3_key}::${rec.sha256}`
}

function cacheGet(key: string): Buffer | undefined {
  const hit = cache.get(key)
  if (hit === undefined) return undefined
  // Refresh recency
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cacheSet(key: string, buf: Buffer): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, buf)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Test seam — drops every cached entry. */
export function clearPackshotBytesCache(): void {
  cache.clear()
}

// ─── Public-HTTPS fallback (see the TODO(iam) block at the top) ───────────────

/** Wall-clock cap on the fallback fetch, so a hung read can't wedge a request. */
const PUBLIC_FETCH_TIMEOUT_MS = 15_000

/** `MCP_S3_PUBLIC_FALLBACK=off` disables the stopgap and restores hard failure. */
function fallbackEnabled(): boolean {
  return (process.env.MCP_S3_PUBLIC_FALLBACK ?? '').trim().toLowerCase() !== 'off'
}

/**
 * A permission failure — the only condition that may trigger the fallback.
 *
 * Deliberately narrow. A 404 `NoSuchKey` must stay an error: falling through to
 * a public fetch for a genuinely missing object would just turn one clear error
 * into a vaguer one. Note S3 reports a missing key as 403 when the caller also
 * lacks `s3:ListBucket`, so a 403 here can mean either — the public fetch then
 * surfaces the real 404, which is the honest outcome.
 */
function isPermissionError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  if (e?.$metadata?.httpStatusCode === 403) return true
  return e?.name === 'AccessDenied' || e?.name === 'AllAccessDisabled'
}

let fallbackWarned = false

function warnFallbackOnce(cause: string): void {
  if (fallbackWarned) return
  fallbackWarned = true
  console.warn('[mcp/bytes] ***************************************************************')
  console.warn('[mcp/bytes] * S3 GetObject denied — serving packshots over PUBLIC HTTPS.  *')
  console.warn('[mcp/bytes] * This is a STOPGAP. Grant s3:GetObject on                    *')
  console.warn('[mcp/bytes] *   arn:aws:s3:::<bucket>/*                                   *')
  console.warn('[mcp/bytes] * to this server\'s IAM principal, then remove the fallback.    *')
  console.warn('[mcp/bytes] * Checksum verification is UNAFFECTED and still enforced.      *')
  console.warn('[mcp/bytes] ***************************************************************')
  console.warn(`[mcp/bytes] first trigger: ${cause}`)
}

/**
 * Read an object over plain HTTPS.
 *
 * ⚠️ The URL is built from `S3_BUCKET` + `AWS_REGION` + the record's `s3_key` —
 * NEVER from a database-supplied `file_url`. A URL column is caller-influenced
 * data and would make this a server-side request forgery sink; the bucket and
 * region come from the environment, and `s3_key` only ever selects a path within
 * that one host. `redirect: 'error'` keeps a redirect from moving the fetch off
 * that host afterwards.
 */
async function fetchPublicObject(bucket: string, key: string): Promise<Buffer> {
  const region = process.env.AWS_REGION ?? 'us-east-1'
  const path = key.split('/').map(encodeURIComponent).join('/')
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${path}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS),
    redirect: 'error',
  })
  if (!res.ok) {
    throw new Error(`Public object fetch failed for ${key} — HTTP ${res.status} ${res.statusText}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

// ─── Body → Buffer ────────────────────────────────────────────────────────────

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error('S3 object had an empty body')
  // AWS SDK v3 mixes a `transformToByteArray` helper onto the stream in Node.
  const maybe = body as { transformToByteArray?: () => Promise<Uint8Array> }
  if (typeof maybe.transformToByteArray === 'function') {
    return Buffer.from(await maybe.transformToByteArray())
  }
  const chunks: Buffer[] = []
  for await (const chunk of body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a packshot's bytes from S3 and verify them against `rec.sha256`.
 *
 * @throws {UnverifiableAssetError} when the record has no recorded digest
 * @throws {ChecksumMismatchError}  when the fetched bytes do not match
 */
export async function loadPackshotBytes(rec: PackshotRecord): Promise<Buffer> {
  if (!rec.sha256) {
    const err = new UnverifiableAssetError(rec.asset_id)
    console.error('[mcp/bytes]', err.message)
    throw err
  }

  const key = cacheKey(rec)
  const cached = cacheGet(key)
  if (cached) return cached

  const bucket = process.env.S3_BUCKET
  if (!bucket) throw new Error('Asset storage is not configured (missing S3_BUCKET)')

  // Signed read first; fall back to public HTTPS only on a permission error.
  // Both paths converge on the SAME verification below — the fallback changes
  // the transport, never the integrity guarantee. See TODO(iam) at the top.
  let buffer: Buffer
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: rec.s3_key }),
    )
    buffer = await bodyToBuffer(response.Body)
  } catch (err) {
    if (!isPermissionError(err) || !fallbackEnabled()) throw err
    const name = (err as { name?: string }).name ?? 'unknown'
    warnFallbackOnce(`${name} on s3_key=${rec.s3_key}`)
    buffer = await fetchPublicObject(bucket, rec.s3_key)
  }

  const actual = createHash('sha256').update(buffer).digest('hex')
  const expected = rec.sha256.trim().toLowerCase()
  if (actual !== expected) {
    const err = new ChecksumMismatchError(rec.asset_id, expected, actual)
    // Logged here as well as audited by the caller: an integrity failure is an
    // operational event, not just an MCP-transaction outcome.
    console.error('[mcp/bytes]', err.message, `(s3_key=${rec.s3_key})`)
    throw err
  }

  cacheSet(key, buffer)
  return buffer
}
