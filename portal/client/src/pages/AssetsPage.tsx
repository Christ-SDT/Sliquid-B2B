import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Asset } from '@/types'
import { Search, FolderOpen, Download, Copy, Check, FileImage, FileText, Share2, Image } from 'lucide-react'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const TYPES = ['All', 'Logo', 'Banner', 'Social', 'Document']

const TYPE_ICONS: Record<string, any> = {
  Logo: Image,
  Banner: FileImage,
  Social: Share2,
  Document: FileText,
}

function AssetCard({ asset }: { asset: Asset }) {
  const [copied, setCopied] = useState(false)
  const Icon = TYPE_ICONS[asset.type] ?? FolderOpen

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.origin + asset.file_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group">
      <div className="aspect-video bg-portal-bg flex items-center justify-center relative overflow-hidden">
        {asset.thumbnail_url
          ? <img src={asset.thumbnail_url} alt={asset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <Icon className="w-12 h-12 text-on-canvas" />
        }
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-black/60 rounded text-[10px] text-on-canvas-subtle font-medium">{asset.type}</span>
        </div>
      </div>
      <div className="p-4">
        <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{asset.brand}</span>
        <h3 className="text-on-canvas text-sm font-medium mt-0.5 line-clamp-2">{asset.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          {asset.dimensions && <span className="text-on-canvas-muted text-xs">{asset.dimensions}</span>}
          {asset.dimensions && asset.file_size && <span className="text-on-canvas text-xs">·</span>}
          {asset.file_size && <span className="text-on-canvas-muted text-xs">{asset.file_size}</span>}
        </div>
        <div className="flex gap-2 mt-3">
          <a
            href={asset.file_url}
            download
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                       text-portal-accent rounded-lg text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          <button
            onClick={copyUrl}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-elevated hover:bg-portal-border
                       text-on-canvas-subtle hover:text-on-canvas rounded-lg text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [type, setType] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (brand !== 'All') params.set('brand', brand)
    if (type !== 'All') params.set('type', type)
    if (search) params.set('search', search)
    api.get<Asset[]>(`/assets?${params}`)
      .then(setAssets)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [brand, type, search])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-on-canvas text-2xl font-bold">Digital Assets</h1>
        <span className="text-on-canvas-muted text-sm">{assets.length} assets</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-on-canvas text-sm
                     focus:outline-none focus:border-portal-accent transition-colors"
        >
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
          <p>No assets found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map(a => <AssetCard key={a.id} asset={a} />)}
        </div>
      )}
    </div>
  )
}
