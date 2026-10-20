import type { AssetCollection, CollectionPhoto } from '@/types'
import { parseServerDate } from '@/lib/utils'

// ─── Brands (shared with AssetsPage's Add/Edit modals) ────────────────────────

export const BRAND_OPTIONS = ['Sliquid', 'RIDE', 'Ride Rocco', 'Sliquid Science']
/** Display names (DB value → human label). */
export const BRAND_DISPLAY: Record<string, string> = { RIDE: 'Ride Lube' }

export function displayBrand(brand: string): string {
  return BRAND_DISPLAY[brand] ?? brand
}

/** Convert a brand DB value to the select state (option value or '__custom__'). */
export function toBrandOpt(brand: string): string {
  return BRAND_OPTIONS.includes(brand) ? brand : '__custom__'
}

interface BrandSelectProps {
  value: string          // DB value or '__custom__'
  customValue: string
  onChangeValue: (v: string) => void
  onChangeCustom: (v: string) => void
  datalistId: string
  id?: string
}

export function BrandSelect({ value, customValue, onChangeValue, onChangeCustom, datalistId, id }: BrandSelectProps) {
  const isCustom = value === '__custom__'
  return (
    <div className="space-y-2">
      <select
        id={id}
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
      >
        {BRAND_OPTIONS.map(b => (
          <option key={b} value={b}>{displayBrand(b)}</option>
        ))}
        <option value="__custom__">Other (type a new brand…)</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={customValue}
          onChange={e => onChangeCustom(e.target.value)}
          placeholder="Enter brand name"
          aria-label="New brand name"
          required
          list={datalistId}
          className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
        />
      )}
      <datalist id={datalistId}>
        {BRAND_OPTIONS.map(b => <option key={b} value={b}>{displayBrand(b)}</option>)}
      </datalist>
    </div>
  )
}

// ─── Collection helpers ───────────────────────────────────────────────────────

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** "New" badge: released within the last 14 days. */
export function isNewCollection(c: AssetCollection): boolean {
  if (c.status !== 'released' || !c.released_at) return false
  const t = parseServerDate(c.released_at).getTime()
  return !Number.isNaN(t) && Date.now() - t < NEW_WINDOW_MS
}

// ─── Binary downloads ─────────────────────────────────────────────────────────
// Raw fetch with the bearer token is the documented exception to api.* for
// binary downloads (same as the product-shots download).

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('portal_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')) } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}

/** Fallback when Content-Disposition is absent or not exposed by CORS. */
export function fallbackFilename(photo: Pick<CollectionPhoto, 'name' | 'file_url'>): string {
  const ext = (photo.file_url.split('?')[0].split('.').pop() ?? '').toLowerCase()
  const base = (photo.name || 'photo').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'photo'
  if (!ext || ext.length > 5 || base.toLowerCase().endsWith(`.${ext}`)) return base
  return `${base}.${ext}`
}

export async function fetchPhotoFile(
  photo: Pick<CollectionPhoto, 'id' | 'name' | 'file_url'>,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/assets/${photo.id}/download`, { headers: authHeaders(), signal })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch { /* not JSON */ }
    throw new Error(message)
  }
  const blob = await res.blob()
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename(photo)
  return { blob, filename }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Unique name inside a ZIP: "a.jpg", "a (2).jpg", … */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!used.has(candidate.toLowerCase())) { used.add(candidate.toLowerCase()); return candidate }
  }
}

export interface ZipFailure { name: string; message: string }

/**
 * Fetch every photo (4 at a time) into a STORE-compressed ZIP — JPEGs are
 * already compressed, so deflating them only burns CPU. Per-photo failures are
 * collected, never fatal. Returns null blob when nothing could be fetched.
 */
export async function buildCollectionZip(
  photos: CollectionPhoto[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob | null; failures: ZipFailure[] }> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const used = new Set<string>()
  const failures: ZipFailure[] = []
  const results: ({ blob: Blob; filename: string } | null)[] = new Array(photos.length).fill(null)
  let next = 0
  let done = 0
  onProgress(0, photos.length)

  async function worker() {
    while (next < photos.length) {
      if (signal.aborted) return
      const index = next++
      const photo = photos[index]
      try {
        results[index] = await fetchPhotoFile(photo, signal)
      } catch (err) {
        if (signal.aborted) return
        failures.push({ name: photo.name, message: err instanceof Error ? err.message : String(err) })
      }
      done++
      onProgress(done, photos.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, photos.length) }, worker))
  if (signal.aborted) return { blob: null, failures }

  // Add in collection order so the ZIP lists files the way the grid shows them.
  let added = 0
  results.forEach(r => {
    if (!r) return
    zip.file(uniqueName(r.filename, used), r.blob, { binary: true })
    added++
  })
  if (added === 0) return { blob: null, failures }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  return { blob, failures }
}

export function zipFilename(collectionName: string): string {
  const safe = collectionName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'collection'
  return `${safe}.zip`
}
