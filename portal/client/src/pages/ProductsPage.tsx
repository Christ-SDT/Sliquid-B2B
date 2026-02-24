import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Product } from '@/types'
import { Search, Package, X } from 'lucide-react'

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
      <p className="text-slate-600 text-xs mb-0.5">{label}</p>
      <p className="text-slate-300 text-sm font-medium">{value}</p>
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
            : <Package className="w-16 h-16 text-slate-700" />
          }
        </div>

        <div className="p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white bg-black/40 rounded-lg p-1">
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-xs font-semibold text-portal-accent uppercase tracking-wider">{product.brand}</span>
              <h3 className="text-white font-bold text-xl mt-0.5 leading-tight">{product.name}</h3>
              {product.unit_size && (
                <span className="text-slate-500 text-sm">{product.unit_size}</span>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium flex-shrink-0 mt-1
              ${product.in_stock ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {product.in_stock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>

          {product.description && (
            <p className="text-slate-400 text-sm mb-5 leading-relaxed">{product.description}</p>
          )}

          {/* Pricing block */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-portal-bg rounded-xl p-3 text-center">
              <p className="text-slate-500 text-xs mb-1">Unit Cost</p>
              <p className="text-white font-bold text-lg">${product.price.toFixed(2)}</p>
            </div>
            {product.unit_msrp != null && (
              <div className="bg-portal-bg rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">MSRP</p>
                <p className="text-portal-accent font-bold text-lg">${product.unit_msrp.toFixed(2)}</p>
              </div>
            )}
            {product.case_cost != null && (
              <div className="bg-portal-bg rounded-xl p-3 text-center">
                <p className="text-slate-500 text-xs mb-1">Case Cost</p>
                <p className="text-white font-semibold text-lg">${product.case_cost.toFixed(2)}</p>
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

          <p className="text-slate-600 text-xs mt-3 text-right">Effective Jan 1, 2026</p>
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
          : <Package className="w-10 h-10 text-slate-700" />
        }
      </div>
      <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{product.brand}</span>
      <h3 className="text-white text-sm font-medium mt-0.5 leading-snug line-clamp-2">{product.name}</h3>
      {product.unit_size && (
        <p className="text-slate-600 text-xs mt-0.5">{product.unit_size}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <div>
          <span className="text-white text-sm font-bold">${product.price.toFixed(2)}</span>
          {product.unit_msrp != null && (
            <span className="text-slate-600 text-xs ml-1.5">MSRP ${product.unit_msrp.toFixed(2)}</span>
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

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">Products</h1>
        <span className="text-slate-500 text-sm">{products.length} items</span>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, vendor #, or UPC…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-white text-sm
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
                : 'bg-surface border border-portal-border text-slate-400 hover:text-white hover:border-slate-500'
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
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
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
