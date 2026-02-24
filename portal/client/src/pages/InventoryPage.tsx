import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { InventoryItem } from '@/types'
import { Search, Archive, RefreshCw } from 'lucide-react'

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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [restocking, setRestocking] = useState<number | null>(null)

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Inventory</h1>
        <span className="text-slate-500 text-sm">{items.length} SKUs</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products or SKU…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-white text-sm
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
                : 'bg-surface border border-portal-border text-slate-400 hover:text-white'
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
                <th className="text-left text-slate-500 font-medium px-4 py-3">Product</th>
                <th className="text-left text-slate-500 font-medium px-4 py-3">Brand</th>
                <th className="text-left text-slate-500 font-medium px-4 py-3 hidden sm:table-cell">SKU</th>
                <th className="text-right text-slate-500 font-medium px-4 py-3">Qty</th>
                <th className="text-right text-slate-500 font-medium px-4 py-3 hidden md:table-cell">Reorder At</th>
                <th className="text-left text-slate-500 font-medium px-4 py-3">Status</th>
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
                    <tr key={item.id} className="border-b border-portal-border/50 hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{item.product_name}</td>
                      <td className="px-4 py-3 text-slate-400">{item.brand}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden sm:table-cell">{item.sku}</td>
                      <td className="px-4 py-3 text-right text-white font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-500 hidden md:table-cell">{item.reorder_level}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.status !== 'in_stock' && (
                          <button
                            onClick={() => handleRestock(item.id)}
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
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <Archive className="w-10 h-10 mb-2 opacity-40" />
            <p>No items found</p>
          </div>
        )}
      </div>
    </div>
  )
}
