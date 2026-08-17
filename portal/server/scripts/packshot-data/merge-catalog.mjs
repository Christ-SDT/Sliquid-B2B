#!/usr/bin/env node
/**
 * Merge parsed filenames + proposed SKU matches + human overrides into the
 * final served catalog.
 *
 * Precedence is deliberate: a human override always wins over the matcher, and
 * anything listed as unresolved is withheld entirely rather than served with a
 * guess. A packshot with no confirmed identity is more dangerous than a missing
 * one -- the whole point is that the agent cannot show the wrong bottle.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [, , catalogPath, skuMapPath, overridesPath, dbPath, outPath] = process.argv
if (!outPath) {
  console.error('usage: merge-catalog.mjs <catalog.json> <sku-map.json> <overrides.json> <portal.db> <out.json>')
  process.exit(1)
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const skuMap = new Map(JSON.parse(readFileSync(skuMapPath, 'utf8')).mappings.map((m) => [m.filename, m]))
const ov = JSON.parse(readFileSync(overridesPath, 'utf8'))

const products = new Map(
  JSON.parse(execFileSync('sqlite3', [`file:${dbPath}?mode=ro`, '-json',
    'SELECT sku, name, brand, category, unit_size, upc, description FROM products'],
    { encoding: 'utf8', maxBuffer: 1 << 24 }))
    .map((p) => [p.sku, p])
)

const served = []
const withheld = []

for (const a of catalog.assets) {
  const override = ov.resolved[a.filename]
  const blocked = ov.unresolved[a.filename]

  if (blocked) {
    withheld.push({ filename: a.filename, reason: blocked.question, blocking: blocked.blocking })
    continue
  }

  let sku = null
  let size = a.size
  let status = a.status
  let provenance

  if (override) {
    sku = override.sku
    size = override.size ?? size
    status = override.status
    provenance = { decided_by: 'human_review', rationale: override.why }
  } else {
    const m = skuMap.get(a.filename)
    if (!m || m.verdict !== 'auto') {
      withheld.push({ filename: a.filename, reason: 'no confident SKU match and no human override', blocking: 'sku' })
      continue
    }
    sku = m.proposed.sku
    provenance = { decided_by: 'auto_match', score: m.score, margin: m.margin }
  }

  const p = sku ? products.get(sku) : null
  if (sku && !p) {
    withheld.push({ filename: a.filename, reason: `override names SKU ${sku} but no such product row exists`, blocking: 'sku' })
    continue
  }

  // Cross-check: if we have both a product row and a parsed size, they must agree.
  if (p && size && p.unit_size) {
    const n = (s) => { const m2 = String(s).match(/^(\d*\.?\d+)/); return m2 ? parseFloat(m2[1]) : null }
    const a1 = n(size), a2 = n(p.unit_size)
    if (a1 !== null && a2 !== null && Math.abs(a1 - a2) > 0.01) {
      withheld.push({ filename: a.filename, reason: `size conflict: catalog says ${size}, product ${sku} says ${p.unit_size}`, blocking: 'size' })
      continue
    }
  }

  served.push({
    asset_id: a.asset_id,
    sku,
    product: p ? p.name : a.product,
    display_name: p ? `${p.name} (${size ?? p.unit_size})` : `${a.product}${size ? ` (${size})` : ''}`,
    size: size ?? (p ? p.unit_size : null),
    collection: a.collection,
    category: p ? p.category : null,
    brand: p ? p.brand : 'Sliquid',
    upc: p ? p.upc : null,
    package_version: a.package_version,
    status,
    filename: a.filename,
    mime_type: a.mime_type,
    bytes: a.bytes,
    sha256: a.sha256,
    provenance,
  })
}

const out = {
  version: 1,
  generated_at: new Date().toISOString(),
  counts: {
    served: served.length,
    active: served.filter((r) => r.status === 'active').length,
    discontinued: served.filter((r) => r.status === 'discontinued').length,
    withheld: withheld.length,
  },
  assets: served.sort((x, y) => x.asset_id.localeCompare(y.asset_id)),
  withheld: withheld.sort((x, y) => x.filename.localeCompare(y.filename)),
}

writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n')

console.log(`served ${out.counts.served}  (active ${out.counts.active}, discontinued ${out.counts.discontinued})`)
console.log(`withheld ${out.counts.withheld}`)
for (const w of withheld) console.log(`  ! ${w.filename}  [${w.blocking}] ${w.reason}`)
console.log('\nActive assets by collection:')
const byCol = {}
for (const r of served.filter((r) => r.status === 'active')) byCol[r.collection] = (byCol[r.collection] ?? 0) + 1
for (const [k, v] of Object.entries(byCol).sort()) console.log(`  ${k.padEnd(12)} ${v}`)
