import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Product } from '@/types'
import { Search, Package, X, Download, Upload } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const CATEGORIES = [
  'All', 'Water-Based', 'Silicone-Based', 'Hybrid', 'Organic',
  'Flavored', 'Warming', 'Stimulating', 'Feminine Wellness',
  'Massage', 'Toy Care', 'Specialty',
]

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-on-canvas-muted text-xs mb-0.5">{label}</p>
      <p className="text-on-canvas-subtle text-sm font-medium">{value}</p>
    </div>
  )
}

function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg z-10 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Product image */}
        <div className="w-full aspect-video bg-portal-bg flex items-center justify-center overflow-hidden rounded-t-2xl">
          {product.image_url
            ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-6" />
            : <Package className="w-16 h-16 text-on-canvas" />
          }
        </div>

        <div className="p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-on-canvas-muted hover:text-on-canvas bg-black/40 rounded-lg p-1">
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-xs font-semibold text-portal-accent uppercase tracking-wider">{product.brand}</span>
              <h3 className="text-on-canvas font-bold text-xl mt-0.5 leading-tight">{product.name}</h3>
              {product.unit_size && (
                <span className="text-on-canvas-muted text-sm">{product.unit_size}</span>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium flex-shrink-0 mt-1
              ${product.in_stock ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {product.in_stock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>

          {product.description && (
            <p className="text-on-canvas-subtle text-sm mb-5 leading-relaxed">{product.description}</p>
          )}

          {/* Pricing block */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-portal-bg rounded-xl p-3 text-center">
              <p className="text-on-canvas-muted text-xs mb-1">Unit Cost</p>
              <p className="text-on-canvas font-bold text-lg">${product.price.toFixed(2)}</p>
            </div>
            {product.unit_msrp != null && (
              <div className="bg-portal-bg rounded-xl p-3 text-center">
                <p className="text-on-canvas-muted text-xs mb-1">MSRP</p>
                <p className="text-portal-accent font-bold text-lg">${product.unit_msrp.toFixed(2)}</p>
              </div>
            )}
            {product.case_cost != null && (
              <div className="bg-portal-bg rounded-xl p-3 text-center">
                <p className="text-on-canvas-muted text-xs mb-1">Case Cost</p>
                <p className="text-on-canvas font-semibold text-lg">${product.case_cost.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Catalog details grid */}
          <div className="bg-portal-bg rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Vendor #"         value={product.vendor_number} />
            <Field label="UPC"              value={product.upc} />
            <Field label="Category"         value={product.category} />
            <Field label="Case Pack"        value={product.case_pack ? `${product.case_pack} units` : undefined} />
            <Field label="Case Weight"      value={product.case_weight} />
            <Field label="Unit Dimensions"  value={product.unit_dimensions} />
            <Field label="Case Dimensions"  value={product.case_dimensions} />
          </div>

          <p className="text-on-canvas-muted text-xs mt-3 text-right">Effective Jan 1, 2026</p>
        </div>
      </div>
    </div>
  )
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-portal-border rounded-xl p-4 text-left hover:border-portal-accent/40
                 hover:bg-surface-elevated transition-all group"
    >
      <div className="aspect-square bg-portal-bg rounded-lg flex items-center justify-center mb-3 overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform" />
          : <Package className="w-10 h-10 text-on-canvas" />
        }
      </div>
      <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{product.brand}</span>
      <h3 className="text-on-canvas text-sm font-medium mt-0.5 leading-snug line-clamp-2">{product.name}</h3>
      {product.unit_size && (
        <p className="text-on-canvas-muted text-xs mt-0.5">{product.unit_size}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <div>
          <span className="text-on-canvas text-sm font-bold">${product.price.toFixed(2)}</span>
          {product.unit_msrp != null && (
            <span className="text-on-canvas-muted text-xs ml-1.5">MSRP ${product.unit_msrp.toFixed(2)}</span>
          )}
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded
          ${product.in_stock ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {product.in_stock ? 'In Stock' : 'Out'}
        </span>
      </div>
    </button>
  )
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  function parseLine(line: string): string[] {
    const fields: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur)
    return fields
  }

  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

export default function ProductsPage() {
  const { user } = useAuth()
  const isAdmin = (user?.role as string) === 'tier5' || (user?.role as string) === 'admin'
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (brand !== 'All') params.set('brand', brand)
    if (category !== 'All') params.set('category', category)
    if (search) params.set('search', search)
    api.get<Product[]>(`/products?${params}`)
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [brand, category, search])

  async function handleExport() {
    const token = localStorage.getItem('portal_token')
    const res = await fetch(`${API_BASE}/products/export`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sliquid-products.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) { setImportMsg('No data rows found in CSV'); return }
    try {
      const result = await api.post<{ inserted: number; updated: number; errors: string[] }>(
        '/products/import', { rows }
      )
      setImportMsg(
        `Imported: ${result.updated} updated, ${result.inserted} new` +
        (result.errors.length ? ` (${result.errors.length} errors)` : '')
      )
      setTimeout(() => setImportMsg(''), 5000)
    } catch (err: any) {
      setImportMsg(err.message ?? 'Import failed')
      setTimeout(() => setImportMsg(''), 5000)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-on-canvas text-2xl font-bold">Products</h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 border border-portal-border text-on-canvas-subtle
                           hover:text-on-canvas hover:border-slate-500 rounded-lg text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                           text-portal-accent rounded-lg text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
              />
            </>
          )}
          <span className="text-on-canvas-muted text-sm">{products.length} items</span>
        </div>
      </div>

      {importMsg && (
        <div className="bg-surface border border-portal-border rounded-lg px-4 py-3 text-on-canvas-subtle text-sm">
          {importMsg}
        </div>
      )}

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, vendor #, or UPC…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-on-canvas text-sm
                     focus:outline-none focus:border-portal-accent transition-colors"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Brand tabs */}
      <div className="flex gap-2 flex-wrap">
        {BRANDS.map(b => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${brand === b
                ? 'bg-portal-accent text-white'
                : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
              }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl p-4 h-52 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <Package className="w-12 h-12 mb-3 opacity-40" />
          <p>No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map(p => <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />)}
        </div>
      )}

      {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
