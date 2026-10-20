import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'
import type { RewardItemSettings, WooProductHit, WooVariation } from '@/types'
import { Loader2, Search, Shirt, X, CheckCircle } from 'lucide-react'
import {
  inputClass, labelClass, primaryButton, secondaryButton, okText, errorText, warnText, wooLabel,
} from './dashboardUi'

/**
 * Maps the certification-reward T-shirt (a variable Woo product, one variation
 * per portal shirt size) and pin (a simple product) to WooCommerce, plus the
 * shipping line used on the $0 order. Saved via
 * PUT /api/admin/integrations/reward-items.
 */

type Picked = { id: number; name: string | null } | null

function wooErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.status === 503) return 'WooCommerce is not configured — connect it above first.'
  return (e as any)?.message ?? fallback
}

function variationLabel(v: WooVariation): string {
  const opts = v.attributes.map(a => a.option).filter(Boolean).join(' / ')
  return `${opts || 'Variation'} — #${v.id}${v.sku ? ` · ${v.sku}` : ''}`
}

/** Auto-match: a variation whose attribute option equals the size, case-insensitive. */
function matchVariation(size: string, variations: WooVariation[]): number | null {
  const s = size.trim().toLowerCase()
  const hit = variations.find(v => v.attributes.some(a => a.option.trim().toLowerCase() === s))
  return hit?.id ?? null
}

function ProductPicker({
  label, wantType, value, onChange,
}: {
  label: string
  wantType: 'variable' | 'simple'
  value: Picked
  onChange: (p: Picked) => void
}) {
  const inputId = useId()
  const listId = useId()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<WooProductHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); setError(''); return }
    const mine = ++seq.current
    const t = setTimeout(() => {
      setLoading(true)
      api.get<WooProductHit[]>(`/reward-orders/meta/products?q=${encodeURIComponent(term)}`)
        .then(r => { if (mine === seq.current) { setHits(Array.isArray(r) ? r : []); setError('') } })
        .catch(e => { if (mine === seq.current) { setHits([]); setError(wooErrorMessage(e, 'Search failed')) } })
        .finally(() => { if (mine === seq.current) setLoading(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-2 min-w-0">
      <label htmlFor={inputId} className={labelClass}>{label}</label>
      <p className="text-sm text-on-canvas flex flex-wrap items-center gap-2">
        <span className="break-words min-w-0">Current: {wooLabel(value?.id ?? null, value?.name)}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs text-on-canvas-subtle hover:text-on-canvas underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent rounded"
          >
            <X className="w-3 h-3" aria-hidden="true" /> Clear
          </button>
        )}
      </p>
      <div className="relative">
        <Search className="w-4 h-4 text-on-canvas-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={`Search WooCommerce for a ${wantType} product…`}
          aria-controls={listId}
          className={`${inputClass} pl-9`}
          autoComplete="off"
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Searching' : q.trim().length >= 2 ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : ''}
      </p>
      {loading && (
        <p className="text-xs text-on-canvas-subtle flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Searching…
        </p>
      )}
      {error && <p className={`text-xs ${errorText}`} role="alert">{error}</p>}
      {hits.length > 0 && (
        <ul id={listId} className="max-h-56 overflow-y-auto border border-portal-border rounded-lg divide-y divide-portal-border bg-portal-bg">
          {hits.map(h => {
            const wrongType = h.type !== wantType
            return (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={wrongType}
                  onClick={() => { onChange({ id: h.id, name: h.name }); setQ(''); setHits([]) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-portal-accent"
                >
                  <span className="text-on-canvas block break-words">{h.name}</span>
                  <span className="text-on-canvas-subtle text-xs block break-words">
                    #{h.id}{h.sku ? ` · ${h.sku}` : ''} · {h.type} · {h.status}
                    {wrongType && ` — needs a ${wantType} product`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!loading && !error && q.trim().length >= 2 && hits.length === 0 && (
        <p className="text-xs text-on-canvas-subtle">No products match.</p>
      )}
    </div>
  )
}

export default function RewardItemsPanel({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<RewardItemSettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [sizes, setSizes] = useState<string[]>([])

  const [shirt, setShirt] = useState<Picked>(null)
  const [pin, setPin] = useState<Picked>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [shipId, setShipId] = useState('free_shipping')
  const [shipTitle, setShipTitle] = useState('Free shipping')

  const [variations, setVariations] = useState<WooVariation[]>([])
  const [varLoading, setVarLoading] = useState(false)
  const [varError, setVarError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; message: string } | null>(null)

  function applySettings(s: RewardItemSettings) {
    setSettings(s)
    setShirt(prev => s.shirt_product_id ? { id: s.shirt_product_id, name: prev?.id === s.shirt_product_id ? prev.name : null } : null)
    setPin(prev => s.pin_product_id ? { id: s.pin_product_id, name: prev?.id === s.pin_product_id ? prev.name : null } : null)
    setMapping(s.shirt_size_variations ?? {})
    setShipId(s.shipping_method_id)
    setShipTitle(s.shipping_method_title)
  }

  useEffect(() => {
    api.get<RewardItemSettings>('/admin/integrations/reward-items')
      .then(applySettings)
      .catch((e: any) => setLoadError(e?.message ?? 'Could not load reward item settings'))
    api.get<{ shirtSizes: string[] }>('/certificates/reward-options')
      .then(r => setSizes(Array.isArray(r.shirtSizes) ? r.shirtSizes : []))
      .catch(() => setSizes([]))
  }, [])

  // Load the shirt's variations whenever the chosen shirt changes.
  const shirtId = shirt?.id ?? null
  const savedShirtId = settings?.shirt_product_id ?? null
  useEffect(() => {
    if (!shirtId) { setVariations([]); setVarError(''); return }
    let cancelled = false
    setVarLoading(true)
    setVarError('')
    api.get<WooVariation[]>(`/reward-orders/meta/products/${shirtId}/variations`)
      .then(vs => {
        if (cancelled) return
        const list = Array.isArray(vs) ? vs : []
        setVariations(list)
        // A different shirt invalidates the old mapping; fill unmapped sizes by name.
        setMapping(prev => {
          const base = shirtId === savedShirtId ? { ...prev } : {}
          const ids = new Set(list.map(v => v.id))
          for (const size of sizes) {
            if (base[size] && ids.has(base[size])) continue
            const m = matchVariation(size, list)
            if (m) base[size] = m
            else if (shirtId !== savedShirtId) delete base[size]
          }
          return base
        })
      })
      .catch(e => { if (!cancelled) { setVariations([]); setVarError(wooErrorMessage(e, 'Could not load variations')) } })
      .finally(() => { if (!cancelled) setVarLoading(false) })
    return () => { cancelled = true }
  }, [shirtId, savedShirtId, sizes])

  const variationById = useMemo(() => new Map(variations.map(v => [v.id, v])), [variations])
  const unmapped = sizes.filter(s => !mapping[s])

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    const clean: Record<string, number> = {}
    for (const [size, id] of Object.entries(mapping)) if (id) clean[size] = id
    try {
      const s = await api.put<RewardItemSettings>('/admin/integrations/reward-items', {
        shirt_product_id: shirt?.id ?? null,
        pin_product_id: pin?.id ?? null,
        shirt_size_variations: shirt ? clean : {},
        shipping_method_id: shipId.trim(),
        shipping_method_title: shipTitle.trim(),
      })
      applySettings(s)
      setSaveMsg({ ok: true, message: 'Reward items saved.' })
    } catch (e: any) {
      setSaveMsg({ ok: false, message: e?.message ?? 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="reward-items-heading" className="bg-surface border border-portal-border rounded-xl p-4 sm:p-6 space-y-5">
      <div>
        <h3 id="reward-items-heading" className="text-on-canvas font-bold text-lg flex items-center gap-2">
          <Shirt className="w-5 h-5 text-portal-accent" aria-hidden="true" /> Reward items
        </h3>
        <p className="text-on-canvas-subtle text-sm mt-0.5">
          Which WooCommerce products the certification T-shirt and pin are, and the shipping line on reward orders.
        </p>
      </div>

      {loadError && <p role="alert" className={`text-sm ${errorText}`}>{loadError}</p>}
      {!settings && !loadError && (
        <p className="text-sm text-on-canvas-subtle flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      )}

      {settings && !canEdit && (
        <dl className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-on-canvas-subtle">T-shirt product</dt>
          <dd className="text-on-canvas break-words">{wooLabel(settings.shirt_product_id, shirt?.name)}</dd>
          <dt className="text-on-canvas-subtle">Pin product</dt>
          <dd className="text-on-canvas break-words">{wooLabel(settings.pin_product_id, pin?.name)}</dd>
          <dt className="text-on-canvas-subtle">Shipping</dt>
          <dd className="text-on-canvas break-words">{settings.shipping_method_title} ({settings.shipping_method_id})</dd>
          <dt className="text-on-canvas-subtle">Size mapping</dt>
          <dd className="text-on-canvas">
            {Object.keys(settings.shirt_size_variations).length === 0 ? 'None' : (
              <ul className="space-y-0.5">
                {Object.entries(settings.shirt_size_variations).map(([size, id]) => {
                  const v = variationById.get(id)
                  return <li key={size} className="break-words">{size} → {v ? variationLabel(v) : `#${id}`}</li>
                })}
              </ul>
            )}
          </dd>
        </dl>
      )}

      {settings && canEdit && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ProductPicker label="T-shirt product (variable)" wantType="variable" value={shirt} onChange={setShirt} />
            <ProductPicker label="Pin product (simple)" wantType="simple" value={pin} onChange={setPin} />
          </div>

          {shirt && (
            <fieldset className="space-y-3 min-w-0">
              <legend className="text-on-canvas text-sm font-semibold">Shirt size → variation</legend>
              {varLoading && (
                <p className="text-sm text-on-canvas-subtle flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading variations…
                </p>
              )}
              {varError && <p role="alert" className={`text-sm ${errorText}`}>{varError}</p>}
              {!varLoading && !varError && variations.length === 0 && (
                <p className={`text-sm ${warnText}`}>This product has no variations. Pick a variable product with one variation per size.</p>
              )}
              {sizes.length === 0 && (
                <p className="text-sm text-on-canvas-subtle">No shirt sizes are configured for the reward form.</p>
              )}
              {variations.length > 0 && sizes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {sizes.map(size => {
                    const id = `shirt-size-${size.replace(/\W+/g, '-')}`
                    return (
                      <div key={size} className="min-w-0">
                        <label htmlFor={id} className={labelClass}>Size {size}</label>
                        <select
                          id={id}
                          value={mapping[size] ?? ''}
                          onChange={e => {
                            const n = Number(e.target.value)
                            setMapping(prev => {
                              const next = { ...prev }
                              if (n) next[size] = n
                              else delete next[size]
                              return next
                            })
                          }}
                          className={inputClass}
                        >
                          <option value="">Not mapped</option>
                          {variations.map(v => <option key={v.id} value={v.id}>{variationLabel(v)}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              )}
              {variations.length > 0 && unmapped.length > 0 && (
                <p className={`text-xs ${warnText}`}>
                  Unmapped: {unmapped.join(', ')}. Orders for these sizes will need the shirt chosen by hand.
                </p>
              )}
            </fieldset>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reward-ship-id" className={labelClass}>Shipping method id</label>
              <input id="reward-ship-id" type="text" value={shipId} onChange={e => setShipId(e.target.value)}
                placeholder="free_shipping" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label htmlFor="reward-ship-title" className={labelClass}>Shipping method title</label>
              <input id="reward-ship-title" type="text" value={shipTitle} onChange={e => setShipTitle(e.target.value)}
                placeholder="Free shipping" className={inputClass} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className={primaryButton}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save reward items'}
            </button>
            <button type="button" onClick={() => settings && applySettings(settings)} disabled={saving} className={secondaryButton}>
              Reset
            </button>
            <p role="status" aria-live="polite" className={`text-sm ${saveMsg ? (saveMsg.ok ? okText : errorText) : 'sr-only'}`}>
              {saveMsg && (saveMsg.ok
                ? <span className="inline-flex items-center gap-1.5"><CheckCircle className="w-4 h-4" aria-hidden="true" />{saveMsg.message}</span>
                : saveMsg.message)}
            </p>
          </div>
        </>
      )}
    </section>
  )
}
