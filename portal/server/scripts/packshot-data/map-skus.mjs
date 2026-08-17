#!/usr/bin/env node
/**
 * Propose a filename -> SKU mapping between the 2025 packshot exports and the
 * 106-row `products` table.
 *
 * This only PROPOSES. Every match is scored and anything below the confidence
 * bar, or with a runner-up too close to call, is emitted as `review` so a human
 * confirms it before it reaches the served catalog. Status is an approval
 * decision and is never inferred from a filename.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [, , catalogPath, dbPath, outPath] = process.argv
if (!catalogPath || !dbPath || !outPath) {
  console.error('usage: map-skus.mjs <catalog.json> <portal.db> <out.json>')
  process.exit(1)
}

const rows = execFileSync('sqlite3', [`file:${dbPath}?mode=ro`, '-json',
  'SELECT sku, name, brand, category, unit_size, upc FROM products ORDER BY sku'],
  { encoding: 'utf8', maxBuffer: 1 << 24 })
const products = JSON.parse(rows)

const OZ = (s) => {
  const m = String(s ?? '').trim().match(/^(\d*\.?\d+)/)
  const n = m ? parseFloat(m[1]) : NaN
  return Number.isFinite(n) ? n : null
}

/** Reduce a name to comparable word tokens, dropping packaging/marketing noise. */
const STOP = new Set(['sliquid', 'naturals', 'organics', 'balance', 'collection', 'lube',
  'the', 'and', 'buck', 'angels', 'angel', 's', 'oz', 'z', '2025'])
const tokens = (s) =>
  s.toLowerCase()
    .replace(/[()—–\-_.,&]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(oz|z)\b/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/s$/, '')) // crude singularize: organics->organic
    .filter((w) => w && !STOP.has(w) && !/^\d$/.test(w))

/** Jaccard overlap of token sets, 0..1. */
function overlap(a, b) {
  const A = new Set(a), B = new Set(b)
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = new Set([...A, ...B]).size
  return union ? inter / union : 0
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const results = []

for (const asset of catalog.assets) {
  const aTok = tokens(asset.product)
  const aOz = OZ(asset.size)

  const scored = products.map((p) => {
    const pTok = tokens(p.name)
    let score = overlap(aTok, pTok)

    // Size agreement is a strong signal; disagreement is near-disqualifying.
    const pOz = OZ(p.unit_size)
    if (aOz !== null && pOz !== null) {
      if (Math.abs(aOz - pOz) < 0.01) score += 0.45
      else score -= 0.55
    } else if (aOz === null && pOz !== null) {
      score += 0.05 // unknown size: mildly prefer any real product
    }

    // Collection agreement.
    const col = asset.collection.toLowerCase()
    const inName = p.name.toLowerCase()
    if (col === 'organics' && inName.includes('organics')) score += 0.15
    if (col === 'balance' && inName.includes('balance')) score += 0.15
    if (col === 'naturals' && inName.includes('naturals')) score += 0.10

    // Multilingual/alternate SKUs are duplicate artwork, not the primary shot.
    if (/multilingual/i.test(p.name)) score -= 0.30

    return { p, score }
  }).sort((x, y) => y.score - x.score)

  const best = scored[0]
  const next = scored[1]
  const margin = best.score - (next?.score ?? 0)

  // Confidence bar: a strong absolute score AND a clear gap to the runner-up.
  const confident = best.score >= 0.55 && margin >= 0.12

  results.push({
    asset_id: asset.asset_id,
    filename: asset.filename,
    parsed_product: asset.product,
    parsed_size: asset.size,
    verdict: confident ? 'auto' : 'review',
    score: Number(best.score.toFixed(3)),
    margin: Number(margin.toFixed(3)),
    proposed: { sku: best.p.sku, name: best.p.name, unit_size: best.p.unit_size, category: best.p.category, upc: best.p.upc },
    runners_up: scored.slice(1, 4).map((s) => ({ sku: s.p.sku, name: s.p.name, unit_size: s.p.unit_size, score: Number(s.score.toFixed(3)) })),
  })
}

// A SKU claimed by two packshots means one of them is mismatched.
const bySku = new Map()
for (const r of results.filter((r) => r.verdict === 'auto')) {
  const k = r.proposed.sku
  if (!bySku.has(k)) bySku.set(k, [])
  bySku.get(k).push(r)
}
for (const [sku, rs] of bySku) {
  if (rs.length > 1) for (const r of rs) { r.verdict = 'review'; r.conflict = `SKU ${sku} claimed by ${rs.length} packshots` }
}

writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), mappings: results }, null, 2) + '\n')

const auto = results.filter((r) => r.verdict === 'auto')
console.log(`${results.length} packshots -> ${auto.length} auto, ${results.length - auto.length} need review\n`)
console.log('--- NEEDS REVIEW ---')
for (const r of results.filter((r) => r.verdict === 'review')) {
  console.log(`${r.filename}`)
  console.log(`   parsed: ${r.parsed_product} / ${r.parsed_size ?? '(no size)'}${r.conflict ? '   [' + r.conflict + ']' : ''}`)
  console.log(`   best:   ${r.proposed.sku} ${r.proposed.name} (${r.proposed.unit_size}) score=${r.score} margin=${r.margin}`)
  for (const u of r.runners_up.slice(0, 2)) console.log(`   alt:    ${u.sku} ${u.name} (${u.unit_size}) score=${u.score}`)
}
