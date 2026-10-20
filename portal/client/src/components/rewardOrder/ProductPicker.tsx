import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search, ChevronLeft } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import type { WooProductHit, WooVariation } from '@/types'

export interface PickedProduct {
  sku: string | null
  woo_product_id: number
  woo_variation_id: number | null
  name: string
}

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

export function variationLabel(v: WooVariation): string {
  return v.attributes.map(a => a.option).filter(Boolean).join(' / ') || `Variation #${v.id}`
}

/**
 * Searches WooCommerce live (GET /reward-orders/meta/products). A variable
 * product cannot be ordered as itself, so picking one opens its variation list
 * and only a variation completes the pick.
 */
export default function ProductPicker({
  title,
  onPick,
  onCancel,
}: {
  title: string
  onPick: (p: PickedProduct) => void
  onCancel: () => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<WooProductHit[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [parent, setParent] = useState<WooProductHit | null>(null)
  const [variations, setVariations] = useState<WooVariation[]>([])
  const [loadingVariations, setLoadingVariations] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); setError(''); return }
    let cancelled = false
    const timer = setTimeout(() => {
      setSearching(true)
      setError('')
      api.get<WooProductHit[]>(`/reward-orders/meta/products?q=${encodeURIComponent(term)}`)
        .then(r => { if (!cancelled) setHits(r) })
        .catch(err => { if (!cancelled) { setHits([]); setError(errText(err, 'Search failed')) } })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [q])

  async function choose(hit: WooProductHit) {
    if (hit.type !== 'variable') {
      onPick({ sku: hit.sku || null, woo_product_id: hit.id, woo_variation_id: null, name: hit.name })
      return
    }
    setParent(hit)
    setVariations([])
    setError('')
    setLoadingVariations(true)
    try {
      setVariations(await api.get<WooVariation[]>(`/reward-orders/meta/products/${hit.id}/variations`))
    } catch (err) {
      setError(errText(err, 'Could not load variations'))
    } finally {
      setLoadingVariations(false)
    }
  }

  return (
    <div className="mt-3 p-3 rounded-lg border border-portal-accent/40 bg-portal-bg space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-on-canvas text-xs font-semibold">{title}</label>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-on-canvas-muted hover:text-on-canvas underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
        >
          Cancel
        </button>
      </div>

      {!parent ? (
        <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-on-canvas-muted" aria-hidden />
            <input
              id={inputId}
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search WooCommerce by name or SKU (2+ characters)"
              className="w-full pl-8 pr-8 py-1.5 bg-surface border border-portal-border rounded-lg text-on-canvas text-sm
                         focus:outline-none focus:border-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent/40"
            />
            {searching && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-portal-accent" aria-label="Searching" />}
          </div>
          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
          {q.trim().length >= 2 && !searching && !error && hits.length === 0 && (
            <p className="text-xs text-on-canvas-muted">No WooCommerce products match.</p>
          )}
          {hits.length > 0 && (
            <ul className="max-h-56 overflow-y-auto divide-y divide-portal-border border border-portal-border rounded-lg bg-surface">
              {hits.map(h => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => choose(h)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-elevated focus:outline-none focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-portal-accent"
                  >
                    <span className="block text-sm text-on-canvas">{h.name}</span>
                    <span className="block text-xs text-on-canvas-muted">
                      {[h.sku && `SKU ${h.sku}`, h.type === 'variable' ? 'Variable — choose a variation' : h.type,
                        h.status !== 'publish' && h.status, h.stock_status === 'outofstock' && 'Out of stock']
                        .filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => { setParent(null); setVariations([]); setError('') }}
            className="flex items-center gap-1 text-xs text-portal-accent hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            <ChevronLeft className="w-3 h-3" aria-hidden /> Back to results
          </button>
          <p className="text-sm text-on-canvas">{parent.name} — choose a variation</p>
          {loadingVariations && <Loader2 className="w-4 h-4 animate-spin text-portal-accent" aria-label="Loading variations" />}
          {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
          {!loadingVariations && !error && variations.length === 0 && (
            <p className="text-xs text-on-canvas-muted">This product has no variations.</p>
          )}
          {variations.length > 0 && (
            <ul className="max-h-56 overflow-y-auto divide-y divide-portal-border border border-portal-border rounded-lg bg-surface">
              {variations.map(v => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onPick({
                      sku: v.sku || parent.sku || null,
                      woo_product_id: parent.id,
                      woo_variation_id: v.id,
                      name: `${parent.name} — ${variationLabel(v)}`,
                    })}
                    className="w-full text-left px-3 py-2 hover:bg-surface-elevated focus:outline-none focus-visible:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-portal-accent"
                  >
                    <span className="block text-sm text-on-canvas">{variationLabel(v)}</span>
                    <span className="block text-xs text-on-canvas-muted">
                      {[v.sku && `SKU ${v.sku}`, v.stock_status === 'outofstock' && 'Out of stock'].filter(Boolean).join(' · ') || `#${v.id}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
