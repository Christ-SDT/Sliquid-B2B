import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { InventoryItem } from '@/types'
import { Search, Archive, RefreshCw, X } from 'lucide-react'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const STATUSES = ['All', 'in_stock', 'low_stock', 'out_of_stock']

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
}

const STATUS_STYLES: Record<string, string> = {
  in_stock: 'bg-emerald-500/20 text-emerald-400',
  low_stock: 'bg-amber-500/20 text-amber-400',
  out_of_stock: 'bg-red-500/20 text-red-400',
}

// ─── Stock Edit Modal ─────────────────────────────────────────────────────────

function StockEditModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: (id: number, newQty: number, prevQty: number) => void
}) {
  const [qty, setQty] = useState(item.quantity)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.put(`/inventory/${item.id}/quantity`, { quantity: qty })
      onSaved(item.id, qty, item.quantity)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-sm z-10 p-6"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-canvas-muted hover:text-on-canvas transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-on-canvas font-bold text-lg mb-1">Edit Stock</h3>
        <p className="text-on-canvas-subtle text-sm mb-0.5">{item.product_name}</p>
        <p className="text-on-canvas-muted text-xs font-mono mb-5">SKU: {item.sku}</p>

        <label className="text-on-canvas-subtle text-sm mb-2 block">Quantity</label>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={e => setQty(Math.max(0, Number(e.target.value)))}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          autoFocus
          className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                     focus:outline-none focus:border-portal-accent transition-colors mb-4"
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-portal-border text-on-canvas-subtle hover:text-on-canvas
                       rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                       text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── WooCommerce Sync Toast ───────────────────────────────────────────────────

function WooSyncToast({ countdown, onCancel }: { countdown: number; onCancel: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-surface border border-portal-border rounded-xl
                    p-4 shadow-xl flex items-center gap-4 min-w-[300px]">
      <div className="flex-1 min-w-0">
        <p className="text-on-canvas text-sm font-medium">
          Syncing to WooCommerce in {countdown}s
        </p>
        <p className="text-on-canvas-muted text-xs mt-0.5">Stock update will be pushed to your store</p>
      </div>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 border border-portal-border text-on-canvas-subtle hover:text-on-canvas
                   rounded-lg text-xs font-medium transition-colors flex-shrink-0"
      >
        Cancel
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PendingSync {
  itemId: number
  sku: string
  prevQty: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [restocking, setRestocking] = useState<number | null>(null)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null)
  const [syncCountdown, setSyncCountdown] = useState(0)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function fetchInventory() {
    setLoading(true)
    const params = new URLSearchParams()
    if (brand !== 'All') params.set('brand', brand)
    if (status !== 'All') params.set('status', status)
    if (search) params.set('search', search)
    api.get<InventoryItem[]>(`/inventory?${params}`)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(fetchInventory, [brand, status, search])

  // Cleanup interval on unmount
  useEffect(() => () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
  }, [])

  async function handleRestock(id: number) {
    setRestocking(id)
    try {
      await api.post('/inventory/restock', { inventory_id: id, quantity: 50 })
      fetchInventory()
    } catch (e) {
      console.error(e)
    } finally {
      setRestocking(null)
    }
  }

  function startSyncTimer(itemId: number, sku: string, prevQty: number) {
    // Clear any prior pending sync
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    setSyncCountdown(20)
    setPendingSync({ itemId, sku, prevQty })

    syncIntervalRef.current = setInterval(() => {
      setSyncCountdown(prev => {
        if (prev <= 1) {
          clearInterval(syncIntervalRef.current!)
          syncIntervalRef.current = null
          // Push stock to WooCommerce
          api.post('/woo/sync-product', { sku }).catch(console.error)
          setPendingSync(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function cancelSync() {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }
    setSyncCountdown(0)
    if (pendingSync) {
      // Revert the quantity in portal
      const { itemId, prevQty } = pendingSync
      setPendingSync(null)
      try {
        await api.put(`/inventory/${itemId}/quantity`, { quantity: prevQty })
        setItems(prev => prev.map(i => {
          if (i.id !== itemId) return i
          const s = prevQty === 0 ? 'out_of_stock' : prevQty <= i.reorder_level ? 'low_stock' : 'in_stock'
          return { ...i, quantity: prevQty, status: s }
        }))
      } catch (e) {
        console.error('Failed to revert quantity:', e)
      }
    }
  }

  async function handleSaved(id: number, newQty: number, prevQty: number) {
    // Optimistic update
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const s = newQty === 0 ? 'out_of_stock' : newQty <= i.reorder_level ? 'low_stock' : 'in_stock'
      return { ...i, quantity: newQty, status: s }
    }))

    // Check if WooCommerce is configured — show sync toast if so
    const item = items.find(i => i.id === id)
    if (!item) return
    try {
      const wooStatus = await api.get<{ configured: boolean }>('/woo/status')
      if (wooStatus.configured) {
        startSyncTimer(id, item.sku, prevQty)
      }
    } catch {
      // WC not configured or endpoint unavailable — skip toast
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-on-canvas text-2xl font-bold">Inventory</h1>
        <span className="text-on-canvas-muted text-sm">{items.length} SKUs</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products or SKU…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-on-canvas text-sm
                     focus:outline-none focus:border-portal-accent transition-colors"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="flex gap-2 flex-wrap">
        {BRANDS.map(b => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${brand === b
                ? 'bg-portal-accent text-white'
                : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
              }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-portal-border">
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3">Product</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3">Brand</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3 hidden sm:table-cell">SKU</th>
                <th className="text-right text-on-canvas-muted font-medium px-4 py-3">Qty</th>
                <th className="text-right text-on-canvas-muted font-medium px-4 py-3 hidden md:table-cell">Reorder At</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-portal-border/50">
                      {[...Array(7)].map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-surface-elevated rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map(item => (
                    <tr
                      key={item.id}
                      onClick={() => setEditing(item)}
                      className="border-b border-portal-border/50 hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-on-canvas font-medium">{item.product_name}</td>
                      <td className="px-4 py-3 text-on-canvas-subtle">{item.brand}</td>
                      <td className="px-4 py-3 text-on-canvas-muted font-mono text-xs hidden sm:table-cell">{item.sku}</td>
                      <td className="px-4 py-3 text-right text-on-canvas font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-on-canvas-muted hidden md:table-cell">{item.reorder_level}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.status !== 'in_stock' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleRestock(item.id) }}
                            disabled={restocking === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent/10 hover:bg-portal-accent/20
                                       text-portal-accent rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ml-auto"
                          >
                            <RefreshCw className={`w-3 h-3 ${restocking === item.id ? 'animate-spin' : ''}`} />
                            Restock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted">
            <Archive className="w-10 h-10 mb-2 opacity-40" />
            <p>No items found</p>
          </div>
        )}
      </div>

      {editing && (
        <StockEditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {pendingSync && syncCountdown > 0 && (
        <WooSyncToast countdown={syncCountdown} onCancel={cancelSync} />
      )}
    </div>
  )
}
