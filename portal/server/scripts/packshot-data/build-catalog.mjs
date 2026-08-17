#!/usr/bin/env node
/**
 * Build a canonical packshot catalog from the raw collection-export filenames.
 *
 * Filenames are human-authored and inconsistent (typos, trailing spaces, double
 * spaces, missing sizes), so parsing is deliberately conservative: anything the
 * rules cannot resolve with confidence is emitted with `needs_review: true`
 * and `status: "pending_approval"` rather than guessed into the active set.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2]
const OUT = process.argv[3]
if (!SRC || !OUT) {
  console.error('usage: build-catalog.mjs <packshots-dir> <catalog.json>')
  process.exit(1)
}

/** Retail size strings, keyed by the shorthand used in filenames. */
const SIZE_MAP = {
  '1oz': '1 oz',
  '2z': '2 oz',
  '2oz': '2 oz',
  '4z': '4.2 oz',
  '4oz': '4.2 oz',
  '8z': '8.5 oz',
  '8oz': '8.5 oz',
}

/** Collection inferred from the source ZIP each file came out of. */
const COLLECTION_RULES = [
  [/^Organics /i, 'Organics'],
  [/^(Balance Soak|Splash|Soothe|Massage)/i, 'Balance'],
  [/^(T Lube|T Wash|T Stim|Sliquid Shine|Soul)/i, 'Specialty'],
]

/**
 * Products the brand team has confirmed are no longer sellable. Sourced from
 * the handoff doc, NOT inferred from filenames -- status is an approval
 * decision, so it lives in an explicit table.
 */
const DISCONTINUED = [
  /^Organics Silk /i,
  /^T Stim /i,
  /^Balance Soak Green Tea/i,
  /^Balance Soak limoncello/i,
]

/** Filename typos -> the correct marketing name. */
const NAME_FIXES = [
  [/Trawberry/gi, 'Strawberry'],
  [/Rasberry/gi, 'Raspberry'],
  [/\bfig\b/g, 'Fig'],
  [/\bvanilla\b/g, 'Vanilla'],
  [/\bpeach\b/g, 'Peach'],
  [/\blimoncello\b/g, 'Limoncello'],
  [/\bOgel\b/g, 'O Gel'],
  [/\bT Lube\b/g, 'T Lube'],
]

const TITLE_MINOR = new Set(['vs', 'and', 'of'])

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && TITLE_MINOR.has(w.toLowerCase())) return w.toLowerCase()
      if (/^[A-Z0-9]{2,}$/.test(w)) return w // H2O, T
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parse(filename) {
  // Two distinct kinds of finding, and conflating them was a real bug:
  //   `cosmetic` — sloppy filename, identity is still unambiguous.
  //   `warnings` — the identity itself could not be established.
  // Only the second kind may hold an asset out of the active catalog. Treating a
  // double space as though it were an unknown product withheld six live Organics
  // SKUs from the agent for no reason.
  const warnings = []
  const cosmetic = []
  let stem = filename.replace(/\.png$/i, '')

  if (/\s{2,}/.test(stem)) cosmetic.push('double space in source filename')
  if (/\s$/.test(stem)) cosmetic.push('trailing space in source filename')
  stem = stem.replace(/\s+/g, ' ').trim()

  // Package version: a trailing 4-digit year, if present.
  let packageVersion = null
  const yearMatch = stem.match(/\b(20\d{2})$/)
  if (yearMatch) {
    packageVersion = yearMatch[1]
    stem = stem.slice(0, yearMatch.index).trim()
  } else {
    warnings.push('no package year in filename')
  }

  // Size token, anywhere in the remaining stem.
  let size = null
  const sizeMatch = stem.match(/\b(\d+(?:\.\d+)?)\s?(?:oz|z)\b/i)
  if (sizeMatch) {
    const key = sizeMatch[0].replace(/\s/g, '').toLowerCase()
    size = SIZE_MAP[key] ?? null
    if (!size) warnings.push(`unrecognized size token "${sizeMatch[0]}"`)
    stem = (stem.slice(0, sizeMatch.index) + ' ' + stem.slice(sizeMatch.index + sizeMatch[0].length)).replace(/\s+/g, ' ').trim()
  } else {
    warnings.push('no size in filename')
  }

  // Trailing shot-index digits ("H2O 4oz 1", "Soul 2oz 2", "Massage Unscented 1").
  const idxMatch = stem.match(/\s(\d)$/)
  let shotIndex = null
  if (idxMatch) {
    shotIndex = Number(idxMatch[1])
    stem = stem.slice(0, idxMatch.index).trim()
  }

  let product = stem
  for (const [re, to] of NAME_FIXES) product = product.replace(re, to)
  product = titleCase(product)

  // Every packshot is a Sliquid product; prefix unless already branded.
  if (!/^Sliquid /i.test(product)) product = `Sliquid ${product}`

  let collection = 'Naturals'
  for (const [re, name] of COLLECTION_RULES) {
    if (re.test(filename)) { collection = name; break }
  }

  const discontinued = DISCONTINUED.some((re) => re.test(filename))

  return { product, size, packageVersion, collection, discontinued, shotIndex, warnings, cosmetic }
}

const files = readdirSync(SRC).filter((f) => /\.png$/i.test(f)).sort()
const records = []

for (const filename of files) {
  const bytes = readFileSync(join(SRC, filename))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const p = parse(filename)

  const idParts = [slug(p.product.replace(/^Sliquid /i, ''))]
  if (p.size) idParts.push(slug(p.size))
  if (p.shotIndex && p.shotIndex > 1) idParts.push(`v${p.shotIndex}`)
  if (p.packageVersion) idParts.push(p.packageVersion)

  const needsReview = p.warnings.length > 0
  const status = p.discontinued ? 'discontinued' : needsReview ? 'pending_approval' : 'active'

  records.push({
    asset_id: idParts.join('-'),
    product: p.product,
    size: p.size,
    collection: p.collection,
    package_version: p.packageVersion,
    status,
    filename,
    mime_type: 'image/png',
    bytes: bytes.length,
    sha256,
    ...(needsReview ? { needs_review: true, review_notes: p.warnings } : {}),
    ...(p.cosmetic.length ? { filename_notes: p.cosmetic } : {}),
  })
}

// Duplicate asset_ids would make retrieval ambiguous -- fail loudly.
const seen = new Map()
for (const r of records) {
  if (seen.has(r.asset_id)) {
    console.error(`DUPLICATE asset_id "${r.asset_id}": ${seen.get(r.asset_id)} and ${r.filename}`)
    process.exitCode = 1
  }
  seen.set(r.asset_id, r.filename)
}

writeFileSync(OUT, JSON.stringify({ version: 1, generated_at: new Date().toISOString(), assets: records }, null, 2) + '\n')

const by = (s) => records.filter((r) => r.status === s).length
console.log(`${records.length} assets -> ${OUT}`)
console.log(`  active           ${by('active')}`)
console.log(`  discontinued     ${by('discontinued')}`)
console.log(`  pending_approval ${by('pending_approval')}`)
for (const r of records.filter((r) => r.needs_review)) {
  console.log(`    ! ${r.filename} :: ${r.review_notes.join('; ')}`)
}
