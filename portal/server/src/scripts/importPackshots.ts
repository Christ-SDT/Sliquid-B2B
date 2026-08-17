/**
 * importPackshots.ts — re-runnable ops script, split into two independent phases.
 *
 * Loads the reviewed 2025 product packshots into the portal's `media` table so
 * the MCP packshot tools (src/packshots.ts) can serve them.
 *
 *   # phase 1 — locally, S3 creds injected from Railway, the DB is never opened
 *   railway run npx tsx src/scripts/importPackshots.ts --upload-only --dry-run
 *   railway run npx tsx src/scripts/importPackshots.ts --upload-only --yes
 *
 *   # phase 2 — inside the container, where the volume DB lives
 *   railway ssh node dist/scripts/importPackshots.js --db-only --verify-objects --yes
 *
 *   # both phases, for a local end-to-end run
 *   npx tsx src/scripts/importPackshots.ts --dry-run
 *   npx tsx src/scripts/importPackshots.ts --yes
 *
 * WHY IT LIVES UNDER src/ (do not move it back to scripts/)
 *
 *   The three things the import needs never coexist in one place: the 75 PNG
 *   masters are only on a laptop (52 MB, gitignored), the S3 credentials are
 *   only in Railway's env, and the SQLite DB is only on the Railway volume
 *   (DB_PATH=/data/portal.db, no network access). So the run has to be split,
 *   and the DB half has to execute *inside the container*.
 *
 *   The container cannot run a file under scripts/: the Dockerfile copies only
 *   `src`, and `npm prune --omit=dev` strips `tsx`. Under `src/` it is compiled
 *   by `tsc` into `dist/scripts/importPackshots.js` and runs on plain `node`
 *   with zero Dockerfile changes. The catalog sits in `src/assets/` for the same
 *   reason — the Dockerfile already does `cp -r src/assets dist/`.
 *
 *   The relative path to the catalog is `../assets/packshot-catalog.json` in
 *   BOTH layouts (src/scripts → src/assets, dist/scripts → dist/assets), so one
 *   expression serves local tsx and containerised node alike.
 *
 * DESIGN NOTES (read before changing anything)
 *
 * 1. THE DB IMPORT MUST STAY LAZY. src/database.ts opens the database and runs
 *    migrations *at import time*. `railway run` injects DB_PATH=/data/portal.db,
 *    which does not exist on a laptop — so a top-level import of database.js
 *    would make `--upload-only` crash under exactly the command it exists to
 *    serve. It is reached only via `await import()` inside the DB phase.
 *
 * 2. INTEGRITY GATE. Every PNG's SHA-256 is re-verified against the catalog
 *    before a single byte is uploaded. The catalog is the record of what a
 *    human reviewed; if the bytes on disk no longer match it, the review does
 *    not apply to them. Any mismatch aborts the whole run — we never upload a
 *    partially-verified set. Correspondingly, `--db-only` never touches the
 *    images directory: it does not exist in the container.
 *
 * 3. NEVER SELF-APPROVE. `media.approved` is the gate that decides whether a
 *    packshot is visible to the agent at all (see the HARD_FILTER contract in
 *    src/packshots.ts). Approval is a human action taken in the portal Media
 *    page. This script writes `approved = 0` on every row it inserts and never
 *    writes 1 under any code path.
 *
 *    On re-run it PRESERVES an existing human approval when the stored sha256
 *    still matches the catalog — the bytes a human approved are the bytes that
 *    are there. If the content changed, approval is reset to 0 because the
 *    human approved different bytes. `--reset-approvals` forces every row back
 *    to 0 regardless.
 *
 * 4. IDEMPOTENT ON `asset_key`. The idempotency key is `media.asset_key`
 *    (= the catalog's `asset_id`), backed by the partial UNIQUE index added in
 *    migration v56. Re-running UPDATEs in place; it must never duplicate.
 *
 * 5. WRITES REQUIRE `--yes`. Absent `--yes`, the destructive half (S3 PUT and
 *    DB write) is skipped and the run is a dry run.
 *
 * 6. `--verify-objects` HeadObjects every key before its row is written, so a
 *    media row can never point at an object that is not in the bucket. The two
 *    phases run from different machines, so "the upload succeeded" is not
 *    something the DB phase can otherwise know.
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import Database from 'better-sqlite3'
import { z } from 'zod'

// ─── Paths ────────────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolves to src/assets/packshot-catalog.json under tsx and
 * dist/assets/packshot-catalog.json under node. Same expression, both layouts.
 */
const CATALOG_PATH = path.join(HERE, '..', 'assets', 'packshot-catalog.json')

/**
 * The PNG masters are gitignored and only ever present on a workstation, so the
 * default points at the catalog-authoring workspace two levels up — which is
 * `portal/server/scripts/packshot-data/images` from both src/scripts and
 * dist/scripts. Override with PACKSHOT_IMAGES_DIR. Only the upload phase reads
 * this; the DB phase must never stat it.
 */
const IMAGES_DIR = process.env.PACKSHOT_IMAGES_DIR
  ? path.resolve(process.env.PACKSHOT_IMAGES_DIR)
  : path.join(HERE, '..', '..', 'scripts', 'packshot-data', 'images')

const S3_PREFIX = 'packshots/2025'
const DIMENSIONS = '1200x1200'
const UPLOADED_BY = 'packshot-import'
const MEDIA_TYPE = 'packshot'
const UPLOAD_CONCURRENCY = 5
const HEAD_CONCURRENCY = 10

/**
 * Columns migrations v56 (packshot_catalog_columns) and v57
 * (packshot_approval_audit) add to `media`. Any absent = the DB is behind.
 */
const REQUIRED_MEDIA_COLUMNS = [
  'sku', 'unit_size', 'package_version', 'packshot_status', 'approved', 'sha256', 'asset_key',
  'approved_by', 'approved_at',
] as const

// ─── Catalog schema ───────────────────────────────────────────────────────────

const AssetSchema = z.object({
  asset_id: z.string().min(1),
  sku: z.string().nullable(),
  product: z.string().min(1),
  display_name: z.string().min(1),
  size: z.string().nullable(),
  collection: z.string().nullable(),
  category: z.string().nullable(),
  brand: z.string().min(1),
  upc: z.string().nullable(),
  package_version: z.string().nullable(),
  status: z.enum(['active', 'discontinued', 'pending_approval']),
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'must be a lowercase hex sha256'),
  provenance: z.unknown().optional(),
})

const WithheldSchema = z.object({
  filename: z.string().min(1),
  reason: z.string().min(1),
  blocking: z.string().optional(),
})

const CatalogSchema = z.object({
  version: z.number(),
  generated_at: z.string(),
  counts: z.record(z.string(), z.number()).optional(),
  assets: z.array(AssetSchema).min(1),
  withheld: z.array(WithheldSchema).default([]),
})

type Asset = z.infer<typeof AssetSchema>
type Catalog = z.infer<typeof CatalogSchema>

// ─── Small helpers ────────────────────────────────────────────────────────────

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
}

function fail(msg: string, detail: string[] = []): never {
  console.error(`\n${c.red('✖ ABORTED')} ${msg}`)
  for (const d of detail) console.error(`  ${d}`)
  console.error('')
  process.exit(1)
}

function rule(label = '') {
  const line = '─'.repeat(Math.max(0, 78 - label.length))
  console.log(c.dim(label ? `${label} ${line}` : line))
}

/** Filename → URL-safe slug. Extension stripped; caller appends '.png'. */
function slugify(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

/** Mirrors the `${(bytes/1024).toFixed(0)} KB` format used by routes/media.ts. */
function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** Mirrors getS3Client() in src/routes/product-shots.ts. */
function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

/** Mirrors buildS3Url() in src/routes/product-shots.ts. */
function buildS3Url(bucket: string, region: string, key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

/** Run `worker` over `items` with a fixed concurrency ceiling, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

interface Args {
  dryRun: boolean
  yes: boolean
  resetApprovals: boolean
  verifyObjects: boolean
  /** Run the S3 upload phase. */
  doUpload: boolean
  /** Run the media-row phase. */
  doDb: boolean
  /** Which flag produced the phase selection, for the banner. */
  phaseLabel: string
}

const USAGE = `
${c.bold('importPackshots')} — load the reviewed 2025 packshots into the media library

  ${c.bold('Two-phase production flow')}

    # phase 1 — locally: verifies checksums and uploads the PNGs. Never opens the DB.
    railway run npx tsx src/scripts/importPackshots.ts --upload-only --dry-run
    railway run npx tsx src/scripts/importPackshots.ts --upload-only --yes

    # phase 2 — inside the container, where the volume DB lives. Never reads the images.
    railway ssh node dist/scripts/importPackshots.js --db-only --verify-objects --yes

  ${c.bold('Local end-to-end')} (both phases; needs images AND a local DB)

    npx tsx src/scripts/importPackshots.ts --dry-run
    npx tsx src/scripts/importPackshots.ts --yes

  ${c.bold('Flags')}

    --upload-only      verify SHA-256s and PUT to S3. Does not touch the database.
    --db-only          upsert media rows from the catalog. Does not read the images dir.
    --verify-objects   HeadObject every S3 key before writing its row, so a row can
                       never point at a missing object. DB phase only.
    --dry-run          preview; touches nothing. Also implied by the absence of --yes.
    --yes              required to actually upload or write.
    --reset-approvals  force approved = 0 on every row (drops human approvals).
    --skip-upload      deprecated alias for --db-only.
    --help, -h         this text.

  PACKSHOT_IMAGES_DIR overrides where the PNG masters are read from.

Without --yes the run is a dry run. Rows are always imported UNAPPROVED; approve
them in the portal Media page at /media.
`

function parseArgs(argv: string[]): Args {
  const known = new Set([
    '--dry-run', '--yes', '--reset-approvals',
    '--upload-only', '--db-only', '--skip-upload', '--verify-objects',
    '--help', '-h',
  ])
  const unknown = argv.filter(a => a.startsWith('-') && !known.has(a))
  if (unknown.length) {
    fail(`unknown flag(s): ${unknown.join(', ')}`, ['Run with --help for usage.'])
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    process.exit(0)
  }

  const uploadOnly = argv.includes('--upload-only')
  // --skip-upload was the old name for "metadata only"; keep it working.
  const dbOnly = argv.includes('--db-only') || argv.includes('--skip-upload')

  if (uploadOnly && dbOnly) {
    fail('--upload-only and --db-only are mutually exclusive', [
      'Omit both to run the upload and the database phase back to back.',
    ])
  }

  const verifyObjects = argv.includes('--verify-objects')
  if (verifyObjects && uploadOnly) {
    fail('--verify-objects applies to the database phase and is meaningless with --upload-only', [
      'The upload phase puts the objects there; there is nothing to verify yet.',
    ])
  }

  const yes = argv.includes('--yes')
  return {
    // --dry-run is explicit; absence of --yes also means dry run.
    dryRun: argv.includes('--dry-run') || !yes,
    yes,
    resetApprovals: argv.includes('--reset-approvals'),
    verifyObjects,
    doUpload: !dbOnly,
    doDb: !uploadOnly,
    phaseLabel: uploadOnly ? 'upload only (S3)' : dbOnly ? 'database only (media rows)' : 'upload + database',
  }
}

// ─── Step 1 — load + validate the catalog ─────────────────────────────────────

function loadCatalog(): Catalog {
  if (!fs.existsSync(CATALOG_PATH)) {
    fail(`catalog not found at ${CATALOG_PATH}`, [
      'The catalog is version-controlled at src/assets/packshot-catalog.json.',
      'In the container it is placed by the Dockerfile line `cp -r src/assets dist/`.',
      'See scripts/README.md.',
    ])
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  } catch (err) {
    fail(`catalog is not valid JSON: ${(err as Error).message}`)
  }

  const parsed = CatalogSchema.safeParse(raw)
  if (!parsed.success) {
    fail('catalog failed schema validation', parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`))
  }
  const catalog = parsed.data

  // Structural invariants the schema cannot express.
  const problems: string[] = []

  const seenIds = new Map<string, number>()
  for (const a of catalog.assets) seenIds.set(a.asset_id, (seenIds.get(a.asset_id) ?? 0) + 1)
  for (const [id, n] of seenIds) if (n > 1) problems.push(`duplicate asset_id "${id}" appears ${n} times`)

  const seenFiles = new Map<string, number>()
  for (const a of catalog.assets) seenFiles.set(a.filename, (seenFiles.get(a.filename) ?? 0) + 1)
  for (const [f, n] of seenFiles) if (n > 1) problems.push(`duplicate filename "${f}" appears ${n} times`)

  // Slug collisions would silently overwrite one another in S3 and violate the
  // UNIQUE constraint on media.s3_key.
  const seenSlugs = new Map<string, string[]>()
  for (const a of catalog.assets) {
    const s = slugify(a.filename)
    if (!s) problems.push(`filename "${a.filename}" slugifies to an empty string`)
    seenSlugs.set(s, [...(seenSlugs.get(s) ?? []), a.filename])
  }
  for (const [s, files] of seenSlugs) {
    if (files.length > 1) problems.push(`slug collision "${s}" from: ${files.join(', ')}`)
  }

  if (problems.length) fail('catalog is internally inconsistent', problems)
  return catalog
}

// ─── Step 2 — re-verify every file's SHA-256 (upload phase only) ──────────────

function verifyIntegrity(assets: Asset[]): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    fail(`image directory not found at ${IMAGES_DIR}`, [
      'The PNGs are intentionally NOT in version control (~52 MB of binaries).',
      'See scripts/README.md → "Where the images live" for how to restore them,',
      'or set PACKSHOT_IMAGES_DIR to point at them.',
      '',
      'If you are on the server and only need to (re-)write the media rows, use',
      '--db-only, which never reads this directory.',
    ])
  }

  const missing: string[] = []
  const sizeMismatch: string[] = []
  const hashMismatch: string[] = []

  for (const a of assets) {
    const filePath = path.join(IMAGES_DIR, a.filename)
    if (!fs.existsSync(filePath)) { missing.push(a.filename); continue }

    const stat = fs.statSync(filePath)
    if (stat.size !== a.bytes) {
      sizeMismatch.push(`${a.filename} — catalog says ${a.bytes} bytes, file is ${stat.size}`)
      continue
    }

    const actual = sha256File(filePath)
    if (actual !== a.sha256) {
      hashMismatch.push(`${a.filename}\n      expected ${a.sha256}\n      actual   ${actual}`)
    }
  }

  const detail: string[] = []
  if (missing.length) detail.push(`${missing.length} file(s) missing from ${IMAGES_DIR}:`, ...missing.map(f => `  • ${f}`))
  if (sizeMismatch.length) detail.push(`${sizeMismatch.length} file(s) with wrong byte length:`, ...sizeMismatch.map(f => `  • ${f}`))
  if (hashMismatch.length) detail.push(`${hashMismatch.length} file(s) failed SHA-256 verification:`, ...hashMismatch.map(f => `  • ${f}`))

  if (detail.length) {
    detail.push(
      '',
      'The catalog records what a human reviewed. Bytes that do not match it have',
      'not been reviewed, so nothing was uploaded. Re-stage the correct images, or',
      'regenerate the catalog (see scripts/README.md) if the change is intentional.',
    )
    fail('integrity check failed — no bytes were uploaded', detail)
  }

  console.log(`${c.green('✓')} SHA-256 verified for all ${assets.length} files against the catalog ${c.dim(`(${IMAGES_DIR})`)}`)
}

// ─── Step 3 — environment ─────────────────────────────────────────────────────

type S3Env =
  | { ok: true; bucket: string; region: string }
  | { ok: false; missing: string[] }

/**
 * `S3_BUCKET` is needed by BOTH phases: the upload phase PUTs into it, and the
 * DB phase bakes it into the `file_url` written to every row. Credentials are
 * needed to PUT, and to HeadObject under --verify-objects.
 */
function checkS3Env(needCredentials: boolean): S3Env {
  const keys = needCredentials
    ? ['S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    : ['S3_BUCKET']
  const missing = keys.filter(k => !process.env[k])
  if (missing.length) return { ok: false, missing }
  return { ok: true, bucket: process.env.S3_BUCKET!, region: process.env.AWS_REGION ?? 'us-east-1' }
}

// ─── Step 4 — DB column preflight ─────────────────────────────────────────────

interface ColumnCheck { ok: boolean; message: string }

/**
 * Dry-run opens the DB READ-ONLY so it cannot write — importing src/database.js
 * would run pending migrations and take a backup, which is a write.
 */
function checkColumnsReadOnly(): ColumnCheck {
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'portal.db')
  if (!fs.existsSync(dbPath)) {
    return { ok: false, message: `no database at ${dbPath} — cannot verify the packshot columns from here` }
  }
  try {
    const ro = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const cols = (ro.prepare("SELECT name FROM pragma_table_info('media')").all() as { name: string }[]).map(x => x.name)
      if (cols.length === 0) return { ok: false, message: `table 'media' does not exist in ${dbPath}` }
      const absent = REQUIRED_MEDIA_COLUMNS.filter(x => !cols.includes(x))
      if (absent.length) {
        return { ok: false, message: `media is missing migration v56/v57 column(s): ${absent.join(', ')} — run the server once to apply migrations` }
      }
      return { ok: true, message: `media has all ${REQUIRED_MEDIA_COLUMNS.length} packshot columns (${dbPath})` }
    } finally {
      ro.close()
    }
  } catch (err) {
    return { ok: false, message: `could not inspect ${dbPath}: ${(err as Error).message}` }
  }
}

// ─── Planning ─────────────────────────────────────────────────────────────────

interface PlannedRow {
  asset: Asset
  filePath: string
  s3Key: string
  fileUrl: string
}

function plan(assets: Asset[], bucket: string, region: string): PlannedRow[] {
  return assets.map(asset => {
    const s3Key = `${S3_PREFIX}/${slugify(asset.filename)}.png`
    return {
      asset,
      filePath: path.join(IMAGES_DIR, asset.filename),
      s3Key,
      fileUrl: buildS3Url(bucket, region, s3Key),
    }
  })
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function tallyBy<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of items) { const k = key(i); m.set(k, (m.get(k) ?? 0) + 1) }
  return new Map([...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function printStatusTable(assets: Asset[]) {
  rule('STATUS BREAKDOWN')
  const byStatus = tallyBy(assets, a => a.status)
  const width = Math.max(...[...byStatus.keys()].map(k => k.length), 'TOTAL'.length)
  for (const [status, n] of byStatus) {
    const bytes = assets.filter(a => a.status === status).reduce((s, a) => s + a.bytes, 0)
    console.log(`  ${status.padEnd(width)}  ${String(n).padStart(3)}   ${c.dim(humanBytes(bytes).padStart(9))}`)
  }
  const total = assets.reduce((s, a) => s + a.bytes, 0)
  console.log(c.dim(`  ${'─'.repeat(width + 18)}`))
  console.log(`  ${c.bold('TOTAL'.padEnd(width))}  ${c.bold(String(assets.length).padStart(3))}   ${c.dim(humanBytes(total).padStart(9))}`)
  console.log('')
}

function printWithheld(catalog: Catalog) {
  rule('WITHHELD — NOT IMPORTED, AWAITING A BRAND-TEAM DECISION')
  if (catalog.withheld.length === 0) {
    console.log(c.green('  None — every reviewed packshot is in the served set.\n'))
    return
  }
  console.log(c.yellow(`  ${catalog.withheld.length} packshot(s) were deliberately held back:\n`))
  catalog.withheld.forEach((w, i) => {
    console.log(`  ${c.bold(`${i + 1}. ${w.filename}`)}`)
    if (w.blocking) console.log(`     ${c.dim('blocked on:')} ${w.blocking}`)
    console.log(`     ${w.reason}`)
    console.log('')
  })
  console.log(c.dim('  These have no SKU/identity decision on record, so they are not served.'))
  console.log(c.dim('  Record a decision in scripts/packshot-data/overrides.json, regenerate the'))
  console.log(c.dim('  catalog and re-copy it to src/assets/ — see scripts/README.md.\n'))
}

// ─── Phases ───────────────────────────────────────────────────────────────────

/** HeadObject every planned key. Aborts naming anything absent. */
async function verifyObjectsExist(rows: PlannedRow[], bucket: string): Promise<void> {
  rule('VERIFYING S3 OBJECTS')
  const s3 = getS3Client()
  const missing: string[] = []
  const errors: string[] = []
  let checked = 0

  await mapWithConcurrency(rows, HEAD_CONCURRENCY, async (r) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: r.s3Key }))
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
        missing.push(`${r.s3Key}  ${c.dim(`(${r.asset.filename})`)}`)
      } else {
        errors.push(`${r.s3Key}: ${(err as Error).message}`)
      }
    }
    checked++
    process.stdout.write(`\r  ${checked}/${rows.length} checked…`)
  })
  process.stdout.write('\n')

  if (errors.length) {
    fail(`${errors.length} object check(s) errored — nothing was written`, [
      ...errors.map(e => `• ${e}`),
      '',
      'These are not 404s. Check the credentials and the bucket policy.',
    ])
  }

  if (missing.length) {
    fail(`${missing.length} of ${rows.length} object(s) are NOT in s3://${bucket}/ — nothing was written`, [
      ...missing.map(m => `• ${m}`),
      '',
      'A media row pointing at a missing object is a broken image in the portal and',
      'a dead URL handed to the agent, so no rows were written at all.',
      '',
      'Run the upload phase first, from a machine that has the PNG masters:',
      '  railway run npx tsx src/scripts/importPackshots.ts --upload-only --yes',
    ])
  }

  console.log(`${c.green('✓')} all ${rows.length} object(s) present in s3://${bucket}/${S3_PREFIX}/\n`)
}

async function uploadPhase(rows: PlannedRow[], bucket: string): Promise<void> {
  rule('UPLOADING TO S3')
  const s3 = getS3Client()
  let uploaded = 0
  const uploadErrors: string[] = []

  await mapWithConcurrency(rows, UPLOAD_CONCURRENCY, async (r) => {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: r.s3Key,
        Body: fs.readFileSync(r.filePath),
        ContentType: r.asset.mime_type,
      }))
      uploaded++
      process.stdout.write(`\r  ${uploaded}/${rows.length} uploaded…`)
    } catch (err) {
      uploadErrors.push(`${r.asset.filename} → ${r.s3Key}: ${(err as Error).message}`)
    }
  })
  process.stdout.write('\n')

  if (uploadErrors.length) {
    fail(`${uploadErrors.length} upload(s) failed — no database rows were written`, [
      ...uploadErrors.map(e => `• ${e}`),
      '',
      'The script is idempotent: fix the cause and re-run, already-uploaded objects',
      'are simply overwritten with identical bytes.',
    ])
  }
  console.log(`${c.green('✓')} ${uploaded} object(s) uploaded to s3://${bucket}/${S3_PREFIX}/\n`)
}

interface DbResult { inserted: number; updated: number; awaiting: number }

async function dbPhase(rows: PlannedRow[], args: Args): Promise<DbResult> {
  // LAZY BY CONTRACT — see design note 1. Importing src/database.js opens the
  // DB at DB_PATH and runs migrations, so it must not happen unless we are
  // actually about to write media rows.
  const { db } = await import('../database.js')

  const cols = (db.prepare("SELECT name FROM pragma_table_info('media')").all() as { name: string }[]).map(x => x.name)
  const absent = REQUIRED_MEDIA_COLUMNS.filter(x => !cols.includes(x))
  if (absent.length) {
    fail('the `media` table is missing packshot columns', [
      `absent: ${absent.join(', ')}`,
      'Migration v56 (packshot_catalog_columns) and/or v57 (packshot_approval_audit)',
      'have not been applied to this database.',
      'Start the server once against this DB_PATH to run migrations, then re-run.',
    ])
  }

  rule('WRITING MEDIA ROWS')

  const selectExisting = db.prepare(
    'SELECT id, approved, sha256 FROM media WHERE asset_key = ?',
  )
  const insertRow = db.prepare(`
    INSERT INTO media (
      filename, label, brand, s3_key, file_url, file_size, mime_type, dimensions,
      uploaded_by, type, sku, unit_size, package_version, packshot_status, sha256,
      asset_key, approved
    ) VALUES (
      @filename, @label, @brand, @s3_key, @file_url, @file_size, @mime_type, @dimensions,
      @uploaded_by, @type, @sku, @unit_size, @package_version, @packshot_status, @sha256,
      @asset_key, 0
    )
  `)
  // NOTE: `approved` is set from @approved, which is only ever 0 or the value
  // already stored on the row. This statement can never raise it to 1.
  //
  // `approved_by` / `approved_at` are cleared whenever approval drops to 0. Left
  // in place they would name a person as the current approver of an asset that is
  // no longer approved — the exact question those columns exist to answer, given a
  // wrong answer. The `CASE` keys off @approved so a preserved approval keeps its
  // original stamp untouched.
  const updateRow = db.prepare(`
    UPDATE media SET
      filename = @filename, label = @label, brand = @brand, s3_key = @s3_key,
      file_url = @file_url, file_size = @file_size, mime_type = @mime_type,
      dimensions = @dimensions, uploaded_by = @uploaded_by, type = @type,
      sku = @sku, unit_size = @unit_size, package_version = @package_version,
      packshot_status = @packshot_status, sha256 = @sha256, approved = @approved,
      approved_by = CASE WHEN @approved = 1 THEN approved_by ELSE NULL END,
      approved_at = CASE WHEN @approved = 1 THEN approved_at ELSE NULL END
    WHERE asset_key = @asset_key
  `)

  let inserted = 0, updated = 0, approvalsPreserved = 0, approvalsReset = 0

  const runAll = db.transaction((planned: PlannedRow[]) => {
    for (const r of planned) {
      const a = r.asset
      const base = {
        filename: a.filename,
        label: a.display_name,
        brand: a.brand,
        s3_key: r.s3Key,
        file_url: r.fileUrl,
        file_size: formatFileSize(a.bytes),
        mime_type: a.mime_type,
        dimensions: DIMENSIONS,
        uploaded_by: UPLOADED_BY,
        type: MEDIA_TYPE,
        sku: a.sku,
        unit_size: a.size,
        package_version: a.package_version,
        packshot_status: a.status,
        sha256: a.sha256,
        asset_key: a.asset_id,
      }

      const existing = selectExisting.get(a.asset_id) as
        { id: number; approved: number; sha256: string | null } | undefined

      if (!existing) {
        insertRow.run(base)
        inserted++
        continue
      }

      // Preserve a human approval only when the bytes are unchanged. Never raise
      // 0 → 1; the only value that can survive here is one a human already set.
      let approved = 0
      if (!args.resetApprovals && existing.approved === 1 && existing.sha256 === a.sha256) {
        approved = 1
        approvalsPreserved++
      } else if (existing.approved === 1) {
        // Revoking because the bytes changed under a human's approval. Say so
        // loudly: this is a packshot silently disappearing from the agent's view,
        // and the operator needs to know to re-review it.
        approvalsReset++
        console.log(
          c.yellow(`  ! ${a.asset_id} was approved; content changed, approval revoked`),
        )
      }

      updateRow.run({ ...base, approved })
      updated++
    }
  })

  runAll(rows)

  console.log(`${c.green('✓')} ${inserted} inserted, ${updated} updated ${c.dim('(idempotent on asset_key)')}`)
  if (approvalsPreserved) console.log(c.dim(`  ${approvalsPreserved} existing approval(s) preserved — content unchanged`))
  if (approvalsReset) {
    console.log(c.yellow(`  ${approvalsReset} previously-approved row(s) reset to unapproved`) +
      c.dim(args.resetApprovals ? ' (--reset-approvals)' : ' — file content changed since approval'))
  }
  console.log('')

  const awaiting = db.prepare(
    `SELECT COUNT(*) AS n FROM media WHERE type = ? AND approved = 0`,
  ).get(MEDIA_TYPE) as { n: number }

  return { inserted, updated, awaiting: awaiting.n }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log('')
  rule()
  console.log(c.bold('  Packshot import → portal media library'))
  console.log(c.dim(`  phase: ${c.bold(args.phaseLabel)}`))
  console.log(c.dim(`  mode:  ${args.yes ? c.yellow('LIVE (will write)') : c.cyan('DRY RUN (nothing will be touched)')}`))
  rule()
  console.log('')

  // 1 ─ catalog (both phases)
  const catalog = loadCatalog()
  console.log(`${c.green('✓')} catalog v${catalog.version} loaded — ${catalog.assets.length} served, ${catalog.withheld.length} withheld ${c.dim(`(generated ${catalog.generated_at})`)}`)
  console.log(c.dim(`  ${CATALOG_PATH}`))

  // 2 ─ integrity gate. Upload phase only: --db-only runs in the container,
  //     where the PNG masters do not and will not exist.
  if (args.doUpload) {
    verifyIntegrity(catalog.assets)
  } else {
    console.log(`${c.dim('·')} ${c.dim('integrity gate skipped — --db-only never reads the images directory')}`)
  }

  // 3 ─ S3 env. Credentials are needed to PUT, and to HeadObject.
  const needCredentials = args.doUpload || args.verifyObjects
  const env = checkS3Env(needCredentials)
  if (env.ok) {
    console.log(`${c.green('✓')} S3 configured — bucket ${c.bold(env.bucket)} region ${c.bold(env.region)}`)
  } else if (args.yes) {
    fail('S3 is not configured', [
      `missing environment variable(s): ${env.missing.join(', ')}`,
      needCredentials
        ? 'Required here: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'
        : 'Required here: S3_BUCKET',
      'Optional: AWS_REGION (defaults to us-east-1)',
      '',
      'S3_BUCKET is required by the database phase too — it is baked into the',
      'file_url stored on every media row.',
      'Set them in portal/server/.env, export them, or run under `railway run`.',
    ])
  } else {
    console.log(`${c.yellow('!')} S3 not configured — missing ${env.missing.join(', ')}`)
    console.log(c.dim('  A live run would refuse. Dry run continues so the plan is still reviewable.'))
  }

  const bucket = env.ok ? env.bucket : '<S3_BUCKET>'
  const region = env.ok ? env.region : (process.env.AWS_REGION ?? 'us-east-1')

  // 4 ─ DB column preflight. Only in a DB phase, and read-only when not live —
  //     --upload-only must not open the database at all (DB_PATH under
  //     `railway run` points at the container volume, which is not here).
  if (args.doDb && !args.yes) {
    const check = checkColumnsReadOnly()
    console.log(`${check.ok ? c.green('✓') : c.yellow('!')} ${check.message}`)
  } else if (!args.doDb) {
    console.log(`${c.dim('·')} ${c.dim('database untouched — --upload-only does not open DB_PATH')}`)
  }

  const rows = plan(catalog.assets, bucket, region)
  console.log('')

  // ─── Plan preview (dry run) ─────────────────────────────────────────────────
  if (!args.yes) {
    rule('PLANNED ACTIONS')
    if (args.doUpload && args.doDb) {
      console.log(c.dim(`  For each of the ${rows.length} assets: PUT the PNG to S3, then upsert one`))
      console.log(c.dim('  media row keyed on asset_key, with approved = 0.\n'))
    } else if (args.doUpload) {
      console.log(c.dim(`  PUT ${rows.length} PNG(s) to S3. No database row is written or read.\n`))
    } else {
      console.log(c.dim(`  Upsert ${rows.length} media row(s) keyed on asset_key, with approved = 0.`))
      console.log(c.dim(`  No bytes are sent; the S3 objects are ${args.verifyObjects ? 'verified present first' : 'assumed present'}.\n`))
    }

    const nameW = Math.min(38, Math.max(...rows.map(r => r.asset.display_name.length)))
    console.log(c.dim(`  ${'DISPLAY NAME'.padEnd(nameW)}  ${'SKU'.padEnd(5)} ${'STATUS'.padEnd(16)} S3 KEY`))
    for (const r of rows) {
      const name = r.asset.display_name.length > nameW ? `${r.asset.display_name.slice(0, nameW - 1)}…` : r.asset.display_name.padEnd(nameW)
      console.log(`  ${name}  ${(r.asset.sku ?? '—').padEnd(5)} ${r.asset.status.padEnd(16)} ${c.dim(r.s3Key)}`)
    }
    console.log('')
    console.log(c.dim(`  file_url pattern: ${buildS3Url(bucket, region, `${S3_PREFIX}/<slug>.png`)}`))
    if (args.doDb) {
      console.log(c.dim(`  every row: type='${MEDIA_TYPE}'  uploaded_by='${UPLOADED_BY}'  dimensions='${DIMENSIONS}'  ${c.bold('approved=0')}`))
    }
    console.log('')

    // --verify-objects is a read, so it is safe and useful in a dry run: it is
    // the cheapest way to find out whether phase 1 actually landed.
    if (args.doDb && args.verifyObjects) {
      if (env.ok) await verifyObjectsExist(rows, bucket)
      else console.log(`${c.yellow('!')} --verify-objects skipped — no S3 credentials in this environment\n`)
    }

    printStatusTable(catalog.assets)
    printWithheld(catalog)

    rule()
    console.log(`  ${c.cyan(c.bold('DRY RUN — nothing was uploaded and nothing was written.'))}`)
    if (!env.ok) console.log(`  ${c.yellow('A live run would be refused until the S3 variables above are set.')}`)
    console.log(`  Re-run with ${c.bold('--yes')} to perform the import.`)
    rule()
    console.log('')
    return
  }

  // ─── Live run ───────────────────────────────────────────────────────────────

  if (args.doUpload) await uploadPhase(rows, bucket)

  let result: DbResult | null = null
  if (args.doDb) {
    if (args.verifyObjects) await verifyObjectsExist(rows, bucket)
    result = await dbPhase(rows, args)
  }

  // ─── Summary — printed on every run, dry or live, both phases ───────────────
  printStatusTable(catalog.assets)
  printWithheld(catalog)

  rule()
  if (result) {
    console.log(`  ${c.green(c.bold(`${result.inserted + result.updated} packshot row(s) imported — ALL AWAITING APPROVAL.`))}`)
    console.log('')
    console.log(`  ${result.awaiting} packshot row(s) in the database are currently ${c.bold('unapproved')} and are`)
    console.log('  therefore invisible to the MCP product-image tools. Nothing is served until a')
    console.log('  human approves them.')
    console.log('')
    console.log(`  ${c.bold('Approve them in the portal:')} sign in as an admin (tier5) and go to`)
    console.log(`  ${c.cyan('Media Library → /media')} — approval is a deliberate human action and this`)
    console.log('  script never performs it.')
  } else {
    console.log(`  ${c.green(c.bold(`${rows.length} object(s) uploaded. NO DATABASE ROWS WERE WRITTEN.`))}`)
    console.log('')
    console.log('  The packshots are in the bucket but nothing references them yet. Run phase 2')
    console.log('  inside the container, where the volume database lives:')
    console.log('')
    console.log(`  ${c.cyan('railway ssh node dist/scripts/importPackshots.js --db-only --verify-objects --yes')}`)
  }
  rule()
  console.log('')
}

main().catch(err => {
  console.error(`\n${c.red('✖ UNEXPECTED ERROR')}`)
  console.error(err)
  process.exit(1)
})
