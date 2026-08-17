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

  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: rec.s3_key }),
  )
  const buffer = await bodyToBuffer(response.Body)

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
