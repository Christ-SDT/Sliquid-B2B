import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { InventoryItem } from '@/types'
import { Search, Archive, RefreshCw, X, Pencil, ChevronRight, RotateCcw } from 'lucide-react'

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

function computeStatus(quantity: number, reorderLevel: number): InventoryItem['status'] {
  return quantity === 0 ? 'out_of_stock' : quantity <= reorderLevel ? 'low_stock' : 'in_stock'
}

// ─── Restock Modal ────────────────────────────────────────────────────────────

function RestockModal({
  item,
  onClose,
  onRestocked,
}: {
  item: InventoryItem
  onClose: () => void
  onRestocked: (id: number, addedQty: number, prevQty: number) => void
}) {
  const [addQty, setAddQty] = useState(50)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const newTotal = item.quantity + Math.max(0, addQty)

  async function handleConfirm() {
    if (addQty <= 0) { setError('Add quantity must be greater than 0'); return }
    setSaving(true)
    setError('')
    try {
      await api.post('/inventory/restock', { inventory_id: item.id, quantity: addQty })
      onRestocked(item.id, addQty, item.quantity)
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Failed to restock')
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

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-portal-accent/10 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4 text-portal-accent" />
          </div>
          <div>
            <h3 className="text-on-canvas font-bold text-lg leading-none">Restock</h3>
            <p className="text-on-canvas-muted text-xs mt-0.5">Add inventory units</p>
          </div>
        </div>

        <p className="text-on-canvas-subtle text-sm font-medium mb-0.5">{item.product_name}</p>
        <p className="text-on-canvas-muted text-xs font-mono mb-5">SKU: {item.sku}</p>

        {/* Current → New preview */}
        <div className="flex items-center gap-3 bg-portal-bg border border-portal-border rounded-lg px-4 py-3 mb-4">
          <div className="flex-1 text-center">
            <p className="text-on-canvas-muted text-xs mb-1">Current</p>
            <p className="text-on-canvas font-bold text-xl">{item.quantity}</p>
          </div>
          <div className="text-on-canvas-muted text-lg">+</div>
          <div className="flex-1 text-center">
            <p className="text-portal-accent text-xs mb-1 font-medium">Adding</p>
            <p className="text-portal-accent font-bold text-xl">{Math.max(0, addQty)}</p>
          </div>
          <div className="text-on-canvas-muted text-lg">=</div>
          <div className="flex-1 text-center">
            <p className="text-emerald-400 text-xs mb-1 font-medium">New Total</p>
            <p className="text-emerald-400 font-bold text-xl">{newTotal}</p>
          </div>
        </div>

        <label className="text-on-canvas-subtle text-sm mb-2 block">Units to add</label>
        <input
          type="number"
          min="1"
          value={addQty}
          onChange={e => setAddQty(Math.max(1, Number(e.target.value)))}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
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
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                       text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Restocking…' : 'Confirm Restock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stock Edit Modal (single-item, non-edit-mode click) ──────────────────────

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

// ─── Bulk Review Modal ────────────────────────────────────────────────────────

interface BulkChange {
  item: InventoryItem
  newQty: number
}

function BulkReviewModal({
  changes,
  onClose,
  onSubmit,
}: {
  changes: BulkChange[]
  onClose: () => void
  // receives final (possibly re-edited) items from modal
  onSubmit: (items: Array<{ id: number; quantity: number }>) => Promise<void>
}) {
  // Editable local quantities — user can adjust here before confirming
  const [localQtys, setLocalQtys] = useState<Record<number, number>>(
    () => Object.fromEntries(changes.map(c => [c.item.id, c.newQty]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Countdown: 5 → 0. First click skips to 0. Second click (or click after 0) submits.
  const [countdown, setCountdown] = useState(5)
  const [countdownDone, setCountdownDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          setCountdownDone(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function skipCountdown() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setCountdown(0)
    setCountdownDone(true)
  }

  async function doSubmit() {
    if (submitting) return
    skipCountdown()
    setSubmitting(true)
    setError('')
    const items = changes.map(c => ({ id: c.item.id, quantity: localQtys[c.item.id] ?? c.newQty }))
    try {
      await onSubmit(items)
      // parent closes modal after setting up undo
    } catch (e: any) {
      setError(e.message ?? 'Failed to save changes')
      setSubmitting(false)
    }
  }

  function handleButtonClick() {
    if (!countdownDone) {
      // First click: skip countdown → button becomes "Submit All Changes"
      skipCountdown()
    } else {
      // Second click (or click after countdown expires): submit
      doSubmit()
    }
  }

  const buttonLabel = submitting
    ? 'Saving…'
    : !countdownDone
    ? `Submit in ${countdown}s`
    : 'Submit All Changes'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border">
          <div>
            <h3 className="text-on-canvas font-bold text-lg">Review Stock Changes</h3>
            <p className="text-on-canvas-muted text-xs mt-0.5">
              {changes.length} {changes.length === 1 ? 'item' : 'items'} · adjust quantities below if needed
            </p>
          </div>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-portal-border">
                <th className="text-left text-on-canvas-muted font-medium px-6 py-3">Product</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3 hidden sm:table-cell">SKU</th>
                <th className="text-right text-on-canvas-muted font-medium px-4 py-3">From</th>
                <th className="text-on-canvas-muted font-medium px-2 py-3 text-center">→</th>
                <th className="text-right text-on-canvas-muted font-medium px-6 py-3">New Qty</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(({ item }) => (
                <tr key={item.id} className="border-b border-portal-border/50">
                  <td className="px-6 py-3 text-on-canvas font-medium leading-snug">{item.product_name}</td>
                  <td className="px-4 py-3 text-on-canvas-muted font-mono text-xs hidden sm:table-cell">{item.sku}</td>
                  <td className="px-4 py-3 text-right text-on-canvas-muted">{item.quantity}</td>
                  <td className="px-2 py-3 text-center text-on-canvas-muted">→</td>
                  <td className="px-6 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      value={localQtys[item.id] ?? item.quantity}
                      onChange={e => setLocalQtys(prev => ({
                        ...prev,
                        [item.id]: Math.max(0, Number(e.target.value)),
                      }))}
                      className="w-20 bg-portal-bg border border-portal-border rounded-md px-2 py-1
                                 text-on-canvas text-sm text-right focus:outline-none focus:border-portal-accent
                                 transition-colors ml-auto block"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className="text-red-400 text-sm px-6 pt-3">{error}</p>}

        {!countdownDone && !submitting && (
          <p className="text-on-canvas-muted text-xs px-6 pt-3">
            Click once to confirm, click again to submit immediately.
          </p>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-portal-border">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-portal-border text-on-canvas-subtle hover:text-on-canvas
                       rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleButtonClick}
            disabled={submitting}
            className={`px-4 py-2.5 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all
              ${!countdownDone && !submitting
                ? 'bg-portal-accent/50 hover:bg-portal-accent/70 cursor-pointer'
                : 'bg-portal-accent hover:bg-portal-accent/90'
              }`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── WooCommerce Sync Toast ───────────────────────────────────────────────────

function WooSyncToast({ countdown, label, onCancel }: { countdown: number; label: string; onCancel: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-surface border border-portal-border rounded-xl
                    p-4 shadow-xl flex items-center gap-4 min-w-[300px]">
      <div className="flex-1 min-w-0">
        <p className="text-on-canvas text-sm font-medium">{label} in {countdown}s</p>
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

// ─── Undo Toast ───────────────────────────────────────────────────────────────

interface UndoSnapshot {
  items: Array<{ id: number; quantity: number }>
  count: number
  countdown: number
}

function UndoToast({ snapshot, onUndo, onDismiss }: {
  snapshot: UndoSnapshot
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface border border-portal-border
                    rounded-xl px-5 py-3.5 shadow-xl flex items-center gap-4 min-w-[280px]">
      <div className="flex-1 min-w-0">
        <p className="text-on-canvas text-sm font-medium">
          {snapshot.count} {snapshot.count === 1 ? 'item' : 'items'} updated
        </p>
        <p className="text-on-canvas-muted text-xs mt-0.5">Undo available for {snapshot.countdown}s</p>
      </div>
      <button
        onClick={onUndo}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent/10 hover:bg-portal-accent/20
                   text-portal-accent rounded-lg text-xs font-medium transition-colors flex-shrink-0"
      >
        <RotateCcw className="w-3 h-3" />
        Undo
      </button>
      <button
        onClick={onDismiss}
        className="text-on-canvas-muted hover:text-on-canvas transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PendingSync {
  skus: string[]
  itemIds: number[]
  prevQtys: Record<number, number>
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [restocking, setRestocking] = useState<InventoryItem | null>(null)
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  // Bulk edit state
  const [editMode, setEditMode] = useState(false)
  const [pendingEdits, setPendingEdits] = useState<Record<number, number>>({})
  const [showBulkReview, setShowBulkReview] = useState(false)

  // Undo state
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // WooCommerce sync
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

  useEffect(() => () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    if (undoTimerRef.current) clearInterval(undoTimerRef.current)
  }, [])

  function exitEditMode() {
    setEditMode(false)
    setPendingEdits({})
  }

  // ── Undo timer ──────────────────────────────────────────────────────────────

  function startUndoTimer(snapshot: Omit<UndoSnapshot, 'countdown'>) {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current)
    setUndoSnapshot({ ...snapshot, countdown: 10 })
    undoTimerRef.current = setInterval(() => {
      setUndoSnapshot(prev => {
        if (!prev || prev.countdown <= 1) {
          clearInterval(undoTimerRef.current!)
          undoTimerRef.current = null
          return null
        }
        return { ...prev, countdown: prev.countdown - 1 }
      })
    }, 1000)
  }

  function dismissUndo() {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current)
    setUndoSnapshot(null)
  }

  async function handleUndo() {
    if (!undoSnapshot) return
    dismissUndo()
    // Also cancel any pending WooCommerce sync (don't push reverted stock)
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }
    setSyncCountdown(0)
    setPendingSync(null)

    try {
      await api.post('/inventory/bulk', { items: undoSnapshot.items })
      setItems(prev => prev.map(i => {
        const reverted = undoSnapshot.items.find(u => u.id === i.id)
        if (!reverted) return i
        return { ...i, quantity: reverted.quantity, status: computeStatus(reverted.quantity, i.reorder_level) }
      }))
    } catch (e) {
      console.error('Undo failed:', e)
    }
  }

  // ── WooCommerce sync ────────────────────────────────────────────────────────

  function startSyncTimer(sync: PendingSync) {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    setSyncCountdown(20)
    setPendingSync(sync)

    syncIntervalRef.current = setInterval(() => {
      setSyncCountdown(prev => {
        if (prev <= 1) {
          clearInterval(syncIntervalRef.current!)
          syncIntervalRef.current = null
          for (const sku of sync.skus) {
            api.post('/woo/sync-product', { sku }).catch(console.error)
          }
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
      const { itemIds, prevQtys } = pendingSync
      setPendingSync(null)
      try {
        await Promise.all(
          itemIds.map(id => api.put(`/inventory/${id}/quantity`, { quantity: prevQtys[id] }))
        )
        setItems(prev => prev.map(i => {
          if (!itemIds.includes(i.id)) return i
          const q = prevQtys[i.id]
          return { ...i, quantity: q, status: computeStatus(q, i.reorder_level) }
        }))
      } catch (e) {
        console.error('Failed to revert quantities:', e)
      }
    }
  }

  // ── Single-item save ────────────────────────────────────────────────────────

  async function handleSingleSaved(id: number, newQty: number, prevQty: number) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      return { ...i, quantity: newQty, status: computeStatus(newQty, i.reorder_level) }
    }))

    // Undo snapshot for single save
    startUndoTimer({ items: [{ id, quantity: prevQty }], count: 1 })

    const item = items.find(i => i.id === id)
    if (!item) return
    try {
      const wooStatus = await api.get<{ configured: boolean }>('/woo/status')
      if (wooStatus.configured) {
        startSyncTimer({ skus: [item.sku], itemIds: [id], prevQtys: { [id]: prevQty } })
      }
    } catch {
      // WC not configured
    }
  }

  // ── Bulk submit ─────────────────────────────────────────────────────────────

  async function handleBulkSubmit(finalItems: Array<{ id: number; quantity: number }>) {
    // Capture prev quantities for undo before updating
    const prevItems = finalItems.map(({ id }) => {
      const item = items.find(i => i.id === id)!
      return { id, quantity: item.quantity }
    })
    const prevQtys: Record<number, number> = Object.fromEntries(prevItems.map(p => [p.id, p.quantity]))
    const skus = finalItems.map(({ id }) => items.find(i => i.id === id)?.sku).filter(Boolean) as string[]

    await api.post('/inventory/bulk', { items: finalItems })

    // Optimistic update
    setItems(prev => prev.map(i => {
      const updated = finalItems.find(f => f.id === i.id)
      if (!updated) return i
      return { ...i, quantity: updated.quantity, status: computeStatus(updated.quantity, i.reorder_level) }
    }))

    exitEditMode()
    setShowBulkReview(false)

    // Undo snapshot
    startUndoTimer({ items: prevItems, count: finalItems.length })

    // WooCommerce sync
    try {
      const wooStatus = await api.get<{ configured: boolean }>('/woo/status')
      if (wooStatus.configured && skus.length > 0) {
        startSyncTimer({ skus, itemIds: finalItems.map(f => f.id), prevQtys })
      }
    } catch {
      // WC not configured
    }
  }

  async function handleRestockConfirmed(id: number, addedQty: number, prevQty: number) {
    const newQty = prevQty + addedQty
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      return { ...i, quantity: newQty, status: computeStatus(newQty, i.reorder_level) }
    }))
    startUndoTimer({ items: [{ id, quantity: prevQty }], count: 1 })
    const item = items.find(i => i.id === id)
    if (!item) return
    try {
      const wooStatus = await api.get<{ configured: boolean }>('/woo/status')
      if (wooStatus.configured) {
        startSyncTimer({ skus: [item.sku], itemIds: [id], prevQtys: { [id]: prevQty } })
      }
    } catch {
      // WC not configured
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const changedCount = Object.entries(pendingEdits).filter(([id, qty]) => {
    const item = items.find(i => i.id === Number(id))
    return item && item.quantity !== qty
  }).length

  const bulkChanges: BulkChange[] = Object.entries(pendingEdits)
    .filter(([id, qty]) => {
      const item = items.find(i => i.id === Number(id))
      return item && item.quantity !== qty
    })
    .map(([id, qty]) => ({ item: items.find(i => i.id === Number(id))!, newQty: qty }))

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-on-canvas text-2xl font-bold">Inventory</h1>
        <div className="flex items-center gap-3">
          <span className="text-on-canvas-muted text-sm">{items.length} SKUs</span>
          {editMode ? (
            <button
              onClick={exitEditMode}
              className="flex items-center gap-1.5 px-3 py-2 border border-portal-border text-on-canvas-subtle
                         hover:text-on-canvas rounded-lg text-sm transition-colors"
            >
              <X className="w-4 h-4" />
              Exit Edit Mode
            </button>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-portal-border
                         text-on-canvas-subtle hover:text-on-canvas rounded-lg text-sm transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit Mode
            </button>
          )}
        </div>
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
                : items.map(item => {
                    const currentQty = pendingEdits[item.id] !== undefined ? pendingEdits[item.id] : item.quantity
                    const isChanged = editMode && pendingEdits[item.id] !== undefined && pendingEdits[item.id] !== item.quantity
                    const displayStatus = isChanged
                      ? computeStatus(currentQty, item.reorder_level)
                      : item.status

                    return (
                      <tr
                        key={item.id}
                        onClick={() => !editMode && setEditing(item)}
                        className={`border-b border-portal-border/50 transition-colors
                          ${editMode
                            ? isChanged
                              ? 'border-l-2 border-l-portal-accent bg-portal-accent/5'
                              : ''
                            : 'hover:bg-surface-elevated/50 cursor-pointer'
                          }`}
                      >
                        <td className="px-4 py-3 text-on-canvas font-medium">{item.product_name}</td>
                        <td className="px-4 py-3 text-on-canvas-subtle">{item.brand}</td>
                        <td className="px-4 py-3 text-on-canvas-muted font-mono text-xs hidden sm:table-cell">{item.sku}</td>
                        <td className="px-4 py-3 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              min="0"
                              value={currentQty}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setPendingEdits(prev => ({
                                ...prev,
                                [item.id]: Math.max(0, Number(e.target.value)),
                              }))}
                              className="w-20 bg-portal-bg border border-portal-border rounded-md px-2 py-1
                                         text-on-canvas text-sm text-right focus:outline-none focus:border-portal-accent
                                         transition-colors ml-auto"
                            />
                          ) : (
                            <span className="text-on-canvas font-semibold">{item.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-on-canvas-muted hidden md:table-cell">{item.reorder_level}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_STYLES[displayStatus]}`}>
                            {STATUS_LABELS[displayStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!editMode && item.status !== 'in_stock' && (
                            <button
                              onClick={e => { e.stopPropagation(); setRestocking(item) }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent/10 hover:bg-portal-accent/20
                                         text-portal-accent rounded-lg text-xs font-medium transition-colors ml-auto"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Restock
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
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

      {/* Restock modal */}
      {restocking && (
        <RestockModal
          item={restocking}
          onClose={() => setRestocking(null)}
          onRestocked={(id, addedQty, prevQty) => {
            setRestocking(null)
            handleRestockConfirmed(id, addedQty, prevQty)
          }}
        />
      )}

      {/* Single-item edit modal (click row in normal mode) */}
      {editing && !editMode && (
        <StockEditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSingleSaved}
        />
      )}

      {/* Bulk review modal */}
      {showBulkReview && (
        <BulkReviewModal
          changes={bulkChanges}
          onClose={() => setShowBulkReview(false)}
          onSubmit={handleBulkSubmit}
        />
      )}

      {/* Sticky bottom bar — bulk edit mode */}
      {editMode && changedCount > 0 && !showBulkReview && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-surface border border-portal-border rounded-xl px-5 py-3.5 shadow-xl
                          flex items-center gap-4">
            <span className="text-on-canvas text-sm font-medium">
              {changedCount} {changedCount === 1 ? 'item' : 'items'} changed
            </span>
            <button
              onClick={() => setShowBulkReview(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                         text-white rounded-lg text-sm font-medium transition-colors"
            >
              Review Changes
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Undo toast — bottom center */}
      {undoSnapshot && (
        <UndoToast
          snapshot={undoSnapshot}
          onUndo={handleUndo}
          onDismiss={dismissUndo}
        />
      )}

      {/* WooCommerce sync toast — bottom right */}
      {pendingSync && syncCountdown > 0 && (
        <WooSyncToast
          countdown={syncCountdown}
          label={pendingSync.skus.length === 1
            ? 'Syncing to WooCommerce'
            : `Syncing ${pendingSync.skus.length} SKUs to WooCommerce`}
          onCancel={cancelSync}
        />
      )}
    </div>
  )
}
