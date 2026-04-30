import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Product } from '@/types'
import { Search, Package, X, Download, Upload, Plus, Pencil, Trash2, Images } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const CATEGORIES = [
  'All', 'Water-Based', 'Silicone-Based', 'Hybrid', 'Organic',
  'Flavored', 'Warming', 'Stimulating', 'Feminine Wellness',
  'Massage', 'Toy Care', 'Specialty',
]
const FORM_CATEGORIES = CATEGORIES.filter(c => c !== 'All')

interface GalleryImg {
  id: number
  label: string
  file_url: string
  filename: string
  file_size: string
  mime_type: string
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-on-canvas-muted text-xs mb-0.5">{label}</p>
      <p className="text-on-canvas-subtle text-sm font-medium">{value}</p>
    </div>
  )
}

// ── Gallery Picker Modal ──────────────────────────────────────────────────────

function GalleryPickerModal({
  onPick,
  onClose,
}: {
  onPick: (img: GalleryImg) => void
  onClose: () => void
}) {
  const [images, setImages] = useState<GalleryImg[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    api.get<{ images: GalleryImg[] }>('/reference-images')
      .then(r => setImages(r.images))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = images.filter(img =>
    img.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-3xl z-10 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0">
          <h2 className="text-on-canvas font-semibold">Reference Gallery</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-portal-border flex-shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search images…"
            className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent"
          />
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square bg-portal-bg rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-on-canvas-muted">
              <Images className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No images found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(img => (
                <button
                  key={img.id}
                  onClick={() => setPicked(img.id === picked ? null : img.id)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-all
                    ${picked === img.id
                      ? 'border-portal-accent ring-2 ring-portal-accent/30'
                      : 'border-transparent hover:border-portal-border'}`}
                >
                  <img src={img.file_url} alt={img.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-portal-border flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-on-canvas-subtle text-sm hover:text-on-canvas"
          >
            Cancel
          </button>
          <button
            disabled={picked === null}
            onClick={() => {
              const img = images.find(i => i.id === picked)
              if (img) onPick(img)
            }}
            className="px-5 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg
                       text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Use Image
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Product Form Modal ────────────────────────────────────────────────────────

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null
  onClose: () => void
  onSaved: (p: Product) => void
}) {
  const isEdit = product !== null
  const inputCls = 'w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors'

  const [name, setName] = useState(product?.name ?? '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [category, setCategory] = useState(product?.category ?? 'Water-Based')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '')
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? '')
  const [inStock, setInStock] = useState<number>(product?.in_stock ?? 1)
  const [isNew, setIsNew] = useState<number>(product?.is_new ?? 0)
  const [unitSize, setUnitSize] = useState(product?.unit_size ?? '')
  const [casePack, setCasePack] = useState(product?.case_pack != null ? String(product.case_pack) : '')
  const [caseCost, setCaseCost] = useState(product?.case_cost != null ? String(product.case_cost) : '')
  const [unitMsrp, setUnitMsrp] = useState(product?.unit_msrp != null ? String(product.unit_msrp) : '')
  const [vendorNumber, setVendorNumber] = useState(product?.vendor_number ?? '')
  const [upc, setUpc] = useState(product?.upc ?? '')
  const [caseWeight, setCaseWeight] = useState(product?.case_weight ?? '')
  const [unitDimensions, setUnitDimensions] = useState(product?.unit_dimensions ?? '')
  const [caseDimensions, setCaseDimensions] = useState(product?.case_dimensions ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showGallery, setShowGallery] = useState(false)

  async function handleSave() {
    if (!name.trim() || !brand.trim() || !sku.trim() || !price) {
      setError('Name, brand, SKU, and price are required.')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      name: name.trim(), brand: brand.trim(), category, sku: sku.trim(),
      description: description.trim() || null,
      price: parseFloat(price),
      image_url: imageUrl.trim() || null,
      in_stock: inStock,
      is_new: isNew,
      unit_size: unitSize.trim() || null,
      case_pack: casePack ? parseInt(casePack) : null,
      case_cost: caseCost ? parseFloat(caseCost) : null,
      unit_msrp: unitMsrp ? parseFloat(unitMsrp) : null,
      vendor_number: vendorNumber.trim() || null,
      upc: upc.trim() || null,
      case_weight: caseWeight.trim() || null,
      unit_dimensions: unitDimensions.trim() || null,
      case_dimensions: caseDimensions.trim() || null,
    }
    try {
      let saved: Product
      if (isEdit) {
        saved = await api.put<Product>(`/products/${product.id}`, payload)
      } else {
        saved = await api.post<Product>('/products', payload)
      }
      onSaved(saved)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save product')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70" />
        <div
          className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-xl z-10 flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border flex-shrink-0">
            <h2 className="text-on-canvas font-semibold text-lg">
              {isEdit ? 'Edit Product' : 'Add Product'}
            </h2>
            <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Image */}
            <div>
              <label className="block text-on-canvas-subtle text-xs font-medium mb-1.5 uppercase tracking-wide">
                Product Image
              </label>
              <div className="flex gap-2">
                <input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="Paste image URL or pick from gallery…"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowGallery(true)}
                  title="Pick from Reference Gallery"
                  className="px-3 py-2 border border-portal-border rounded-lg text-on-canvas-subtle
                             hover:text-on-canvas hover:border-slate-500 flex-shrink-0 transition-colors"
                >
                  <Images className="w-4 h-4" />
                </button>
              </div>
              {imageUrl && (
                <div className="mt-2 h-28 bg-portal-bg rounded-lg overflow-hidden flex items-center justify-center">
                  <img src={imageUrl} alt="Preview" className="max-h-full max-w-full object-contain p-2" />
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div>
              <p className="text-on-canvas-subtle text-xs font-medium uppercase tracking-wide mb-3">
                Basic Info
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-on-canvas-muted text-xs mb-1">Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Product name" className={inputCls} />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Brand *</label>
                  <input
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="e.g. Sliquid"
                    list="brand-suggestions"
                    className={inputCls}
                  />
                  <datalist id="brand-suggestions">
                    <option value="Sliquid" />
                    <option value="RIDE" />
                    <option value="Ride Rocco" />
                  </datalist>
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">SKU *</label>
                  <input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SLQ-H2O-04" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-on-canvas-muted text-xs mb-1">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                    {FORM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Unit Size</label>
                  <input value={unitSize} onChange={e => setUnitSize(e.target.value)} placeholder="e.g. 4.2 oz" className={inputCls} />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Vendor #</label>
                  <input value={vendorNumber} onChange={e => setVendorNumber(e.target.value)} placeholder="Vendor number" className={inputCls} />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">UPC</label>
                  <input value={upc} onChange={e => setUpc(e.target.value)} placeholder="UPC barcode" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div>
              <p className="text-on-canvas-subtle text-xs font-medium uppercase tracking-wide mb-3">Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Unit Cost *</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={price} onChange={e => setPrice(e.target.value)}
                    placeholder="0.00" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">MSRP</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={unitMsrp} onChange={e => setUnitMsrp(e.target.value)}
                    placeholder="0.00" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Case Cost</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={caseCost} onChange={e => setCaseCost(e.target.value)}
                    placeholder="0.00" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Case Pack (units)</label>
                  <input
                    type="number" step="1" min="0"
                    value={casePack} onChange={e => setCasePack(e.target.value)}
                    placeholder="e.g. 12" className={inputCls}
                  />
                </div>
              </div>
            </div>

            {/* Shipping / Catalog */}
            <div>
              <p className="text-on-canvas-subtle text-xs font-medium uppercase tracking-wide mb-3">
                Catalog Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Case Weight</label>
                  <input value={caseWeight} onChange={e => setCaseWeight(e.target.value)} placeholder="e.g. 4.5 lbs" className={inputCls} />
                </div>
                <div>
                  <label className="block text-on-canvas-muted text-xs mb-1">Unit Dimensions</label>
                  <input value={unitDimensions} onChange={e => setUnitDimensions(e.target.value)} placeholder='e.g. 1.5"x5"' className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-on-canvas-muted text-xs mb-1">Case Dimensions</label>
                  <input value={caseDimensions} onChange={e => setCaseDimensions(e.target.value)} placeholder='e.g. 10"x8"x6"' className={inputCls} />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-on-canvas-muted text-xs mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Product description…"
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* In Stock */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={inStock === 1}
                onChange={e => setInStock(e.target.checked ? 1 : 0)}
                className="w-4 h-4 accent-portal-accent"
              />
              <span className="text-on-canvas-subtle text-sm">In Stock</span>
            </label>

            {/* Mark as New */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isNew === 1}
                onChange={e => setIsNew(e.target.checked ? 1 : 0)}
                className="w-4 h-4 accent-portal-accent"
              />
              <span className="text-on-canvas-subtle text-sm">Mark as New <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sliquid-blue/10 text-sliquid-blue">New</span></span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-portal-border flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-on-canvas-subtle text-sm hover:text-on-canvas transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg
                         text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>

      {showGallery && (
        <GalleryPickerModal
          onPick={img => { setImageUrl(img.file_url); setShowGallery(false) }}
          onClose={() => setShowGallery(false)}
        />
      )}
    </>
  )
}

// ── Product Detail Modal ──────────────────────────────────────────────────────

function ProductModal({
  product,
  onClose,
  isAdmin,
  onEdit,
  onDelete,
}: {
  product: Product
  onClose: () => void
  isAdmin: boolean
  onEdit: (p: Product) => void
  onDelete: (id: number) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

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

          {/* Admin actions */}
          {isAdmin && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-portal-border">
              <button
                onClick={() => onEdit(product)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-portal-border rounded-lg
                           text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500 text-sm transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-portal-border rounded-lg
                             text-on-canvas-subtle hover:text-red-400 hover:border-red-500/50 text-sm transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xs">Delete this product?</span>
                  <button
                    onClick={() => onDelete(product.id)}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors"
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-on-canvas-subtle text-xs hover:text-on-canvas transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-surface border border-portal-border rounded-xl p-4 text-left hover:border-portal-accent/40
                 hover:bg-surface-elevated transition-all group"
    >
      <div className="relative aspect-square bg-portal-bg rounded-lg flex items-center justify-center mb-3 overflow-hidden">
        {product.image_url
          ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform" />
          : <Package className="w-10 h-10 text-on-canvas" />
        }
        {!!product.is_new && (
          <span className="absolute top-2 left-2 bg-sliquid-blue text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            New
          </span>
        )}
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

// ── CSV helpers ───────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { user } = useAuth()
  const isAdmin = (user?.role as string) === 'tier5' || (user?.role as string) === 'admin'

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [formProduct, setFormProduct] = useState<Product | 'new' | null>(null)
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
      // Re-fetch to pick up imports
      const params = new URLSearchParams()
      if (brand !== 'All') params.set('brand', brand)
      if (category !== 'All') params.set('category', category)
      if (search) params.set('search', search)
      api.get<Product[]>(`/products?${params}`).then(setProducts).catch(() => {})
    } catch (err: any) {
      setImportMsg(err.message ?? 'Import failed')
      setTimeout(() => setImportMsg(''), 5000)
    }
  }

  function handleSaved(saved: Product) {
    setFormProduct(null)
    setSelected(null)
    if (formProduct === 'new') {
      setProducts(prev => [saved, ...prev])
    } else {
      setProducts(prev => prev.map(p => p.id === saved.id ? saved : p))
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/products/${id}`)
      setProducts(prev => prev.filter(p => p.id !== id))
      setSelected(null)
    } catch (e: any) {
      // Inline error not critical — just close
      setSelected(null)
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
                onClick={() => setFormProduct('new')}
                className="flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent/80
                           text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Product
              </button>
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
          {products.map(p => (
            <ProductCard key={p.id} product={p} onClick={() => setSelected(p)} />
          ))}
        </div>
      )}

      {selected && (
        <ProductModal
          product={selected}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
          onEdit={p => { setSelected(null); setFormProduct(p) }}
          onDelete={handleDelete}
        />
      )}

      {formProduct !== null && (
        <ProductFormModal
          product={formProduct === 'new' ? null : formProduct}
          onClose={() => setFormProduct(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
