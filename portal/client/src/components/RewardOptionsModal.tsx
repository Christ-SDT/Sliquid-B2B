import { useState, useEffect, useMemo } from 'react'
import { api } from '@/api/client'
import { X, Loader2, Search, Check, Plus, Trash2, RotateCcw } from 'lucide-react'

interface RewardProduct {
  sku: string
  name: string
  brand: string
  unitSize: string | null
  label: string
}

interface OptionsPayload {
  products: RewardProduct[]
  allowedSkus: string[] | null
  shirtSizes: string[]
  defaultShirtSizes: string[]
}

interface Props {
  mode: 'products' | 'shirts'
  onClose: () => void
}

/**
 * Admin editor for what appears in the certification reward form.
 *
 * `allowedSkus: null` from the server means "no curation saved yet" — rendered
 * as everything-selected, matching the server's own fallback so the admin sees
 * the same list partners currently see.
 */
export default function RewardOptionsModal({ mode, onClose }: Props) {
  const [data, setData] = useState<OptionsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sizes, setSizes] = useState<string[]>([])
  const [newSize, setNewSize] = useState('')

  useEffect(() => {
    api.get<OptionsPayload>('/certificates/reward-options/all')
      .then(d => {
        setData(d)
        setSelected(new Set(d.allowedSkus ?? d.products.map(p => p.sku)))
        setSizes(d.shirtSizes)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load options'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.products
    return data.products.filter(p =>
      p.label.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    )
  }, [data, search])

  function toggle(sku: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  function addSize() {
    const v = newSize.trim().toUpperCase()
    if (!v || sizes.includes(v)) { setNewSize(''); return }
    setSizes(prev => [...prev, v])
    setNewSize('')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'products') {
        await api.put('/certificates/reward-options', { products: [...selected] })
      } else {
        await api.put('/certificates/reward-options', { shirtSizes: sizes })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  const isProducts = mode === 'products'
  const allShown = filtered.length > 0 && filtered.every(p => selected.has(p.sku))

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-portal-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0">
          <div>
            <h2 className="text-on-canvas font-semibold">
              {isProducts ? 'Available reward products' : 'Available shirt sizes'}
            </h2>
            <p className="text-on-canvas-muted text-xs mt-0.5">
              {isProducts
                ? 'Ticked products appear in the partner reward picker. One size shown per product — 4 oz where it exists, otherwise 8 oz.'
                : 'Sizes offered in the reward form dropdown, in this order.'}
            </p>
          </div>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
          </div>
        )}

        {error && (
          <div className="mx-5 mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && data && isProducts && (
          <>
            <div className="px-5 py-3 border-b border-portal-border flex items-center gap-3 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg pl-9 pr-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelected(prev => {
                  const next = new Set(prev)
                  // Acts on the filtered view so a search narrows what you toggle.
                  filtered.forEach(p => allShown ? next.delete(p.sku) : next.add(p.sku))
                  return next
                })}
                className="flex-shrink-0 px-3 py-2 border border-portal-border hover:bg-surface-elevated text-on-canvas rounded-lg text-xs font-medium transition-colors"
              >
                {allShown ? 'Clear shown' : 'Select shown'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {filtered.length === 0 ? (
                <p className="text-on-canvas-muted text-sm text-center py-8">No products match “{search}”.</p>
              ) : (
                <ul className="space-y-1">
                  {filtered.map(p => {
                    const on = selected.has(p.sku)
                    return (
                      <li key={p.sku}>
                        <button
                          type="button"
                          onClick={() => toggle(p.sku)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-elevated transition-colors text-left"
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                            ${on ? 'bg-portal-accent border-portal-accent' : 'border-portal-border'}`}>
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-on-canvas text-sm truncate">{p.label}</span>
                            <span className="block text-on-canvas-muted text-xs truncate">{p.brand} · SKU {p.sku}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {!loading && data && !isProducts && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="space-y-1.5 mb-4">
              {sizes.map(s => (
                <li key={s} className="flex items-center justify-between gap-3 px-3 py-2 bg-portal-bg border border-portal-border rounded-lg">
                  <span className="text-on-canvas text-sm font-medium">{s}</span>
                  <button
                    type="button"
                    onClick={() => setSizes(prev => prev.filter(x => x !== s))}
                    disabled={sizes.length === 1}
                    title={sizes.length === 1 ? 'At least one size is required' : 'Remove'}
                    className="text-on-canvas-muted hover:text-red-400 disabled:opacity-30 disabled:hover:text-on-canvas-muted transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <input
                value={newSize}
                onChange={e => setNewSize(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSize() } }}
                placeholder="Add a size (e.g. 3XL)"
                className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
              />
              <button
                type="button"
                onClick={addSize}
                className="flex items-center gap-1.5 px-3 py-2 border border-portal-border hover:bg-surface-elevated text-on-canvas rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSizes(data.defaultShirtSizes)}
              className="mt-3 flex items-center gap-1.5 text-on-canvas-muted hover:text-on-canvas text-xs transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to default ({data.defaultShirtSizes.join(', ')})
            </button>
          </div>
        )}

        {!loading && data && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-portal-border flex-shrink-0">
            <p className="text-on-canvas-muted text-xs">
              {isProducts
                ? `${selected.size} of ${data.products.length} selected`
                : `${sizes.length} size${sizes.length === 1 ? '' : 's'}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-portal-border hover:bg-surface-elevated text-on-canvas rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || (isProducts && selected.size === 0)}
                title={isProducts && selected.size === 0 ? 'Select at least one product' : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
