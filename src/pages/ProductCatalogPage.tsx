import { useEffect, useState } from 'react'

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://sliquid-b2b-production.up.railway.app'

const RETAILER_URL = 'https://sliquid.com/retailers/become-a-sliquid-retailer/'

const BRAND_TABS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']

interface CatalogProduct {
  id: number
  name: string
  brand: string
  category: string | null
  image_url: string | null
  in_stock: number
  unit_size: string | null
  unit_msrp: number | null
  case_pack: number | null
  case_weight: string | null
  unit_dimensions: string | null
  case_dimensions: string | null
  description: string | null
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3L2 7.5V16.5L12 21L22 16.5V7.5L12 3Z" />
      <path d="M12 3V21" />
      <path d="M2 7.5L12 12L22 7.5" />
      <path d="M7 5.25L17 9.75" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Detail Field ───────────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-gray-800 text-sm font-semibold">{value}</p>
    </div>
  )
}

// ── Product Modal ──────────────────────────────────────────────────────────────

function ProductModal({ product, onClose }: { product: CatalogProduct; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-3xl w-full max-w-md overflow-y-auto max-h-[92vh] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Image area */}
        <div className="w-full aspect-[4/3] bg-stone-100 flex items-center justify-center overflow-hidden rounded-t-3xl">
          {product.image_url
            ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-contain p-8"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )
            : <PackageIcon className="w-20 h-20 text-stone-400" />
          }
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-stone-200/80 hover:bg-stone-300 rounded-xl p-1.5 transition-colors"
          aria-label="Close"
        >
          <XIcon className="w-4 h-4 text-stone-600" />
        </button>

        <div className="px-6 pb-6 pt-5">
          {/* Brand + status */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="text-xs font-bold text-sliquid-blue uppercase tracking-widest">
              {product.brand}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0
              ${product.in_stock ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-600'}`}>
              {product.in_stock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>

          <h2 className="text-gray-900 font-bold text-2xl leading-snug mb-1">{product.name}</h2>
          {product.unit_size && (
            <p className="text-gray-500 text-sm mb-4">{product.unit_size}</p>
          )}

          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-5">{product.description}</p>
          )}

          {/* MSRP highlight */}
          {product.unit_msrp != null && (
            <div className="bg-stone-50 rounded-2xl p-4 mb-5 text-center border border-stone-100">
              <p className="text-gray-400 text-xs mb-1">MSRP</p>
              <p className="text-sliquid-blue font-bold text-3xl">${product.unit_msrp.toFixed(2)}</p>
            </div>
          )}

          {/* Catalog details */}
          <div className="bg-stone-50 rounded-2xl p-5 grid grid-cols-2 gap-x-6 gap-y-4 border border-stone-100">
            <DetailField label="Category"         value={product.category} />
            <DetailField label="Case Pack"        value={product.case_pack ? `${product.case_pack} units` : null} />
            <DetailField label="Case Weight"      value={product.case_weight} />
            <DetailField label="Unit Dimensions"  value={product.unit_dimensions} />
            <DetailField label="Case Dimensions"  value={product.case_dimensions} />
          </div>

          <p className="text-gray-400 text-xs mt-4 text-right">Effective Jan 1, 2026</p>
        </div>
      </div>
    </div>
  )
}

// ── Product Card ───────────────────────────────────────────────────────────────

function ProductCard({ product, onClick }: { product: CatalogProduct; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-stone-100 shadow-sm hover:shadow-md
                 transition-all duration-200 overflow-hidden text-left w-full group"
    >
      {/* Image area */}
      <div className="bg-stone-100 aspect-square flex items-center justify-center overflow-hidden rounded-xl m-2.5">
        {product.image_url
          ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="w-full h-full object-contain p-5 group-hover:scale-105 transition-transform duration-300"
            />
          )
          : <PackageIcon className="w-14 h-14 text-stone-400" />
        }
      </div>

      {/* Info */}
      <div className="px-4 pb-4 pt-2">
        <p className="text-[10px] font-bold text-sliquid-blue uppercase tracking-widest mb-1">{product.brand}</p>
        <h3 className="text-gray-900 text-sm font-bold leading-snug line-clamp-2 mb-1">{product.name}</h3>
        {product.unit_size && (
          <p className="text-gray-500 text-xs mb-3">{product.unit_size}</p>
        )}

        <div className="flex items-center justify-between gap-2 mt-auto">
          <div>
            {product.unit_msrp != null
              ? <span className="text-gray-900 font-bold text-base">${product.unit_msrp.toFixed(2)} <span className="text-gray-400 text-xs font-normal">MSRP</span></span>
              : <span className="text-gray-400 text-xs">Price available in portal</span>
            }
          </div>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0
            ${product.in_stock ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-600'}`}>
            {product.in_stock ? 'In Stock' : 'Out'}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden animate-pulse">
      <div className="bg-stone-100 aspect-square m-2.5 rounded-xl" />
      <div className="px-4 pb-4 pt-2 space-y-2">
        <div className="h-2.5 bg-stone-100 rounded w-16" />
        <div className="h-4 bg-stone-100 rounded w-3/4" />
        <div className="h-3 bg-stone-100 rounded w-1/3" />
        <div className="h-5 bg-stone-100 rounded w-1/2 mt-2" />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeBrand, setActiveBrand] = useState('Sliquid')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CatalogProduct | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/products/catalog`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load catalog')
        return r.json()
      })
      .then((data: CatalogProduct[]) => setProducts(data))
      .catch(() => setError('Unable to load the product catalog. Please try again later.'))
      .finally(() => setLoading(false))
  }, [])

  const BRAND_ORDER: Record<string, number> = { Sliquid: 0, RIDE: 1, 'Ride Rocco': 2 }

  const filtered = products
    .filter(p => {
      const matchesBrand = activeBrand === 'All' || p.brand === activeBrand
      const matchesSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.category ?? '').toLowerCase().includes(search.toLowerCase())
      return matchesBrand && matchesSearch
    })
    .sort((a, b) => {
      const orderA = BRAND_ORDER[a.brand] ?? 99
      const orderB = BRAND_ORDER[b.brand] ?? 99
      return orderA - orderB
    })

  return (
    <main className="bg-white min-h-screen">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[1240px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">Product Catalog</p>
          <h1 className="text-text-dark text-[38px] font-semibold tracking-[-0.5px] mb-3 leading-tight">
            Body-Safe Products, <br className="hidden sm:block" />Transparently Formulated
          </h1>
          <p className="text-text-gray text-base leading-relaxed max-w-xl">
            Browse our complete range of intimate wellness products. Every formula is glycerin-free, paraben-free, and crafted for body safety.
            Wholesale pricing and partner ordering available through the{' '}
            <a href="/partner-login" className="text-sliquid-blue hover:underline font-medium">partner portal</a>.
          </p>
        </div>
      </section>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <section className="sticky top-0 z-10 bg-white border-b border-gray-100 py-4 px-4 sm:px-6">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Brand tabs */}
          <div className="flex gap-2 flex-wrap">
            {BRAND_TABS.map(b => (
              <button
                key={b}
                onClick={() => setActiveBrand(b)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border
                  ${activeBrand === b
                    ? 'bg-sliquid-blue text-white border-sliquid-blue'
                    : 'bg-white text-text-gray border-gray-200 hover:border-gray-400 hover:text-text-dark'
                  }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm text-text-dark
                         placeholder:text-gray-400 focus:outline-none focus:border-sliquid-blue transition-colors"
            />
          </div>
        </div>
      </section>

      {/* ── Product Grid ─────────────────────────────────────────────────────── */}
      <section className="py-10 px-4 sm:px-6">
        <div className="max-w-[1240px] mx-auto">
          {error ? (
            <div className="text-center py-20">
              <p className="text-text-gray">{error}</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(15)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-text-gray">
              <PackageIcon className="w-12 h-12 mb-4 text-gray-300" />
              <p className="font-medium">No products found</p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 text-sliquid-blue text-sm hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-text-gray text-sm mb-5">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filtered.map(p => (
                  <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Become a Retailer CTA ────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-bg-light-blue border-t border-gray-100">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-3">
            Partner With Us
          </p>
          <h2 className="text-text-dark text-[34px] font-semibold tracking-[-0.5px] leading-tight mb-5">
            Become a Sliquid Retailer
          </h2>
          <p className="text-text-gray text-base leading-relaxed max-w-2xl mx-auto mb-5">
            Carry the industry's most trusted body-safe intimacy brand. Sliquid offers dedicated marketing support,
            ready-to-use merchandising assets, and a team committed to helping your store sell smarter and grow with confidence.
          </p>

          {/* Benefit pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              'Dedicated marketing support',
              'In-store merchandising assets',
              'Staff training resources',
              'Flexible order minimums',
              'Clean, body-safe formulas',
              '20+ years of brand trust',
            ].map(b => (
              <span
                key={b}
                className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-text-gray font-medium shadow-sm"
              >
                {b}
              </span>
            ))}
          </div>

          <a
            href={RETAILER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-sliquid-blue hover:bg-sliquid-dark-blue
                       text-white font-semibold text-base px-8 py-3.5 rounded-xl
                       transition-colors duration-150 shadow-sm"
          >
            Apply to Become a Retailer
            <ArrowIcon className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Modal */}
      {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
