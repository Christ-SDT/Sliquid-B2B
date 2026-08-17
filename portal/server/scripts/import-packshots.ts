/**
 * import-packshots.ts — one-off, re-runnable ops script.
 *
 * Loads the reviewed 2025 product packshots into the portal's `media` table so
 * the MCP packshot tools (src/packshots.ts) can serve them.
 *
 *   npx tsx scripts/import-packshots.ts --dry-run     # preview, touches nothing
 *   npx tsx scripts/import-packshots.ts --yes         # actually upload + write
 *
 * DESIGN NOTES (read before changing anything)
 *
 * 1. INTEGRITY GATE. Every PNG's SHA-256 is re-verified against the catalog
 *    before a single byte is uploaded. The catalog is the record of what a
 *    human reviewed; if the bytes on disk no longer match it, the review does
 *    not apply to them. Any mismatch aborts the whole run — we never upload a
 *    partially-verified set.
 *
 * 2. NEVER SELF-APPROVE. `media.approved` is the gate that decides whether a
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
 * 3. IDEMPOTENT ON `asset_key`. The idempotency key is `media.asset_key`
 *    (= the catalog's `asset_id`), backed by the partial UNIQUE index added in
 *    migration v56. Re-running UPDATEs in place; it must never duplicate.
 *
 * 4. WRITES REQUIRE `--yes`. Absent `--yes`, the destructive half (S3 PUT and
 *    DB write) is skipped and the run is a dry run.
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import Database from 'better-sqlite3'
import { z } from 'zod'

// ─── Paths ────────────────────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(HERE, 'packshot-data')
const CATALOG_PATH = path.join(DATA_DIR, 'served-catalog.json')
const IMAGES_DIR = path.join(DATA_DIR, 'images')

const S3_PREFIX = 'packshots/2025'
const DIMENSIONS = '1200x1200'
const UPLOADED_BY = 'packshot-import'
const MEDIA_TYPE = 'packshot'
const UPLOAD_CONCURRENCY = 5

/** Columns migration v56 adds to `media`. Absent = the migration has not run. */
const REQUIRED_MEDIA_COLUMNS = [
  'sku', 'unit_size', 'package_version', 'packshot_status', 'approved', 'sha256', 'asset_key',
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

interface Args { dryRun: boolean; yes: boolean; resetApprovals: boolean; skipUpload: boolean }

function parseArgs(argv: string[]): Args {
  const known = new Set(['--dry-run', '--yes', '--reset-approvals', '--skip-upload', '--help', '-h'])
  const unknown = argv.filter(a => a.startsWith('-') && !known.has(a))
  if (unknown.length) fail(`unknown flag(s): ${unknown.join(', ')}`, ['Usage: npx tsx scripts/import-packshots.ts [--dry-run] [--yes] [--reset-approvals] [--skip-upload]'])

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
${c.bold('import-packshots')} — load the reviewed 2025 packshots into the media library

  npx tsx scripts/import-packshots.ts --dry-run           preview only, touches nothing
  npx tsx scripts/import-packshots.ts --yes               upload to S3 + upsert media rows
  npx tsx scripts/import-packshots.ts --yes --reset-approvals
                                                          also force approved = 0 on every
                                                          existing row (drops human approvals)
  npx tsx scripts/import-packshots.ts --yes --skip-upload
                                                          re-sync metadata only; assumes the
                                                          S3 objects are already in place

Without --yes the run is a dry run. Rows are always imported UNAPPROVED; approve
them in the portal Media page at /media.
`)
    process.exit(0)
  }

  const yes = argv.includes('--yes')
  // --dry-run is explicit; absence of --yes also means dry run.
  return {
    dryRun: argv.includes('--dry-run') || !yes,
    yes,
    resetApprovals: argv.includes('--reset-approvals'),
    skipUpload: argv.includes('--skip-upload'),
  }
}

// ─── Step 1 — load + validate the catalog ─────────────────────────────────────

function loadCatalog(): Catalog {
  if (!fs.existsSync(CATALOG_PATH)) {
    fail(`catalog not found at ${CATALOG_PATH}`, ['See scripts/README.md — the catalog is version-controlled and should be present.'])
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

// ─── Step 2 — re-verify every file's SHA-256 ──────────────────────────────────

function verifyIntegrity(assets: Asset[]): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    fail(`image directory not found at ${IMAGES_DIR}`, [
      'The PNGs are intentionally NOT in version control (~52 MB of binaries).',
      'See scripts/README.md → "Where the images live" for how to restore them.',
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

  console.log(`${c.green('✓')} SHA-256 verified for all ${assets.length} files against the catalog`)
}

// ─── Step 3 — environment ─────────────────────────────────────────────────────

/**
 * `S3_BUCKET` is needed even with --skip-upload, because it is baked into the
 * `file_url` written to every row. The credentials are only needed to PUT.
 */
function checkS3Env(needCredentials: boolean): { ok: true; bucket: string; region: string } | { ok: false; missing: string[] } {
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
    return { ok: false, message: `no database at ${dbPath} — cannot verify migration v56 columns from here` }
  }
  try {
    const ro = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const cols = (ro.prepare("SELECT name FROM pragma_table_info('media')").all() as { name: string }[]).map(x => x.name)
      if (cols.length === 0) return { ok: false, message: `table 'media' does not exist in ${dbPath}` }
      const absent = REQUIRED_MEDIA_COLUMNS.filter(x => !cols.includes(x))
      if (absent.length) {
        return { ok: false, message: `media is missing migration v56 column(s): ${absent.join(', ')} — run the server once to apply migrations` }
      }
      return { ok: true, message: `media has all ${REQUIRED_MEDIA_COLUMNS.length} migration v56 columns (${dbPath})` }
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
  console.log(c.dim('  Record a decision in packshot-data/overrides.json and regenerate the'))
  console.log(c.dim('  catalog to bring them in — see scripts/README.md.\n'))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log('')
  rule()
  console.log(c.bold('  Packshot import → portal media library'))
  console.log(c.dim(`  mode: ${args.yes ? c.yellow('LIVE (will upload to S3 and write to the database)') : c.cyan('DRY RUN (nothing will be touched)')}`))
  rule()
  console.log('')

  // 1 ─ catalog
  const catalog = loadCatalog()
  console.log(`${c.green('✓')} catalog v${catalog.version} loaded — ${catalog.assets.length} served, ${catalog.withheld.length} withheld ${c.dim(`(generated ${catalog.generated_at})`)}`)

  // 2 ─ integrity (always, in both modes — this is the whole point of the gate)
  verifyIntegrity(catalog.assets)

  // 3 ─ S3 env
  const env = checkS3Env(!args.skipUpload)
  if (env.ok) {
    console.log(`${c.green('✓')} S3 configured — bucket ${c.bold(env.bucket)} region ${c.bold(env.region)}`)
    if (args.skipUpload) console.log(c.yellow('  ! --skip-upload: no bytes will be sent, S3 objects are assumed to exist already'))
  } else if (args.yes) {
    fail('S3 is not configured', [
      `missing environment variable(s): ${env.missing.join(', ')}`,
      'Required: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY',
      'Optional: AWS_REGION (defaults to us-east-1)',
      '',
      'S3_BUCKET is required even with --skip-upload — it is baked into the',
      'file_url stored on every media row.',
      'Set them in portal/server/.env or export them, then re-run.',
    ])
  } else {
    console.log(`${c.yellow('!')} S3 not configured — missing ${env.missing.join(', ')}`)
    console.log(c.dim(`  A live run would refuse. Dry run continues so the plan is still reviewable.`))
  }

  const bucket = env.ok ? env.bucket : '<S3_BUCKET>'
  const region = env.ok ? env.region : (process.env.AWS_REGION ?? 'us-east-1')

  // 4 ─ DB columns. Dry run inspects read-only; a live run re-checks after
  // importing src/database.js, which will have applied any pending migration.
  if (!args.yes) {
    const check = checkColumnsReadOnly()
    console.log(`${check.ok ? c.green('✓') : c.yellow('!')} ${check.message}`)
  }

  const rows = plan(catalog.assets, bucket, region)
  console.log('')

  // ─── Dry run ────────────────────────────────────────────────────────────────
  if (!args.yes) {
    rule('PLANNED ACTIONS')
    console.log(c.dim(`  For each of the ${rows.length} assets: PUT the PNG to S3, then upsert one`))
    console.log(c.dim(`  media row keyed on asset_key, with approved = 0.\n`))

    const nameW = Math.min(38, Math.max(...rows.map(r => r.asset.display_name.length)))
    console.log(c.dim(`  ${'DISPLAY NAME'.padEnd(nameW)}  ${'SKU'.padEnd(5)} ${'STATUS'.padEnd(16)} S3 KEY`))
    for (const r of rows) {
      const name = r.asset.display_name.length > nameW ? `${r.asset.display_name.slice(0, nameW - 1)}…` : r.asset.display_name.padEnd(nameW)
      console.log(`  ${name}  ${(r.asset.sku ?? '—').padEnd(5)} ${r.asset.status.padEnd(16)} ${c.dim(r.s3Key)}`)
    }
    console.log('')
    console.log(c.dim(`  file_url pattern: ${buildS3Url(bucket, region, `${S3_PREFIX}/<slug>.png`)}`))
    console.log(c.dim(`  every row: type='${MEDIA_TYPE}'  uploaded_by='${UPLOADED_BY}'  dimensions='${DIMENSIONS}'  ${c.bold('approved=0')}`))
    console.log('')

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

  // Import the real DB module only now — it applies pending migrations and takes
  // a backup, both of which are writes and must not happen during a dry run.
  const { db } = await import('../src/database.js')

  const cols = (db.prepare("SELECT name FROM pragma_table_info('media')").all() as { name: string }[]).map(x => x.name)
  const absent = REQUIRED_MEDIA_COLUMNS.filter(x => !cols.includes(x))
  if (absent.length) {
    fail('the `media` table is missing migration v56 columns', [
      `absent: ${absent.join(', ')}`,
      'Migration v56 (packshot_catalog_columns) has not been applied to this database.',
      'Start the server once against this DB_PATH to run migrations, then re-run.',
    ])
  }

  // ── Upload phase — all or nothing, before any DB write.
  if (args.skipUpload) {
    console.log(c.yellow(`! upload phase skipped (--skip-upload) — ${rows.length} object(s) assumed present in s3://${bucket}/${S3_PREFIX}/\n`))
  } else {
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

  // ── DB phase — one transaction, all or nothing.
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
  const updateRow = db.prepare(`
    UPDATE media SET
      filename = @filename, label = @label, brand = @brand, s3_key = @s3_key,
      file_url = @file_url, file_size = @file_size, mime_type = @mime_type,
      dimensions = @dimensions, uploaded_by = @uploaded_by, type = @type,
      sku = @sku, unit_size = @unit_size, package_version = @package_version,
      packshot_status = @packshot_status, sha256 = @sha256, approved = @approved
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
        approvalsReset++
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

  // ── Summary
  printStatusTable(catalog.assets)
  printWithheld(catalog)

  const awaiting = db.prepare(
    `SELECT COUNT(*) AS n FROM media WHERE type = ? AND approved = 0`,
  ).get(MEDIA_TYPE) as { n: number }

  rule()
  console.log(`  ${c.green(c.bold(`${inserted + updated} packshot row(s) imported — ALL AWAITING APPROVAL.`))}`)
  console.log('')
  console.log(`  ${awaiting.n} packshot row(s) in the database are currently ${c.bold('unapproved')} and are`)
  console.log(`  therefore invisible to the MCP product-image tools. Nothing is served until a`)
  console.log(`  human approves them.`)
  console.log('')
  console.log(`  ${c.bold('Approve them in the portal:')} sign in as an admin (tier5) and go to`)
  console.log(`  ${c.cyan('Media Library → /media')} — approval is a deliberate human action and this`)
  console.log(`  script never performs it.`)
  rule()
  console.log('')
}

main().catch(err => {
  console.error(`\n${c.red('✖ UNEXPECTED ERROR')}`)
  console.error(err)
  process.exit(1)
})
