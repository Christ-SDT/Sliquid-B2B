import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Asset, Creative } from '@/types'
import {
  Search, FolderOpen, Download, Copy, Check,
  FileImage, FileText, Share2, Image, Video, Mail, Printer, Megaphone, BookOpen,
} from 'lucide-react'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']

// ─── Unified library item ─────────────────────────────────────────────────────

type LibraryItem =
  | (Asset & { _source: 'asset'; displayName: string })
  | (Creative & { _source: 'creative'; displayName: string })

// Tab definitions
const TABS = [
  { key: 'sheets',   label: 'Info Sheets' },
  { key: 'assets',   label: 'Digital Assets' },
  { key: 'campaign', label: 'Campaign Materials' },
  { key: 'video',    label: 'Video Assets' },
] as const
type TabKey = typeof TABS[number]['key']

// Which types appear in each tab
const TAB_FILTER: Record<TabKey, { source: 'asset' | 'creative' | 'both'; types?: string[] }> = {
  sheets:   { source: 'both',     types: ['Document', 'Print'] },
  assets:   { source: 'asset',    types: ['Logo', 'Banner', 'Social'] },
  campaign: { source: 'creative', types: ['Banner', 'Social Media', 'Email', 'Multi'] },
  video:    { source: 'creative', types: ['Video'] },
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Logo:         Image,
  Banner:       FileImage,
  Social:       Share2,
  Document:     FileText,
  'Social Media': Megaphone,
  Email:        Mail,
  Print:        Printer,
  Multi:        Megaphone,
  Video:        Video,
}

// ─── LibraryCard ─────────────────────────────────────────────────────────────

function LibraryCard({ item }: { item: LibraryItem }) {
  const [copied, setCopied] = useState(false)
  const Icon = TYPE_ICONS[item.type] ?? FolderOpen
  const isAsset = item._source === 'asset'

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.origin + item.file_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group">
      <div className="aspect-video bg-portal-bg flex items-center justify-center relative overflow-hidden">
        {item.thumbnail_url
          ? <img src={item.thumbnail_url} alt={item.displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <Icon className="w-12 h-12 text-on-canvas" />
        }
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-black/60 rounded text-[10px] text-on-canvas-subtle font-medium">{item.type}</span>
        </div>
      </div>
      <div className="p-4">
        <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{item.brand}</span>
        <h3 className="text-on-canvas text-sm font-medium mt-0.5 line-clamp-2">{item.displayName}</h3>
        {'description' in item && item.description && (
          <p className="text-on-canvas-muted text-xs mt-1 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {item.dimensions && <span className="text-on-canvas-muted text-xs">{item.dimensions}</span>}
          {item.dimensions && item.file_size && <span className="text-on-canvas-muted text-xs">·</span>}
          {item.file_size && <span className="text-on-canvas-muted text-xs">{item.file_size}</span>}
        </div>
        <div className="flex gap-2 mt-3">
          <a
            href={item.file_url}
            download
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                       text-portal-accent rounded-lg text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          {isAsset && (
            <button
              onClick={copyUrl}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-elevated hover:bg-portal-border
                         text-on-canvas-subtle hover:text-on-canvas rounded-lg text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [allItems, setAllItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('sheets')
  const [brand, setBrand] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Asset[]>('/assets'),
      api.get<Creative[]>('/creatives'),
    ])
      .then(([assets, creatives]) => {
        const assetItems: LibraryItem[] = assets.map(a => ({
          ...a,
          _source: 'asset' as const,
          displayName: a.name,
        }))
        const creativeItems: LibraryItem[] = creatives.map(c => ({
          ...c,
          _source: 'creative' as const,
          displayName: c.title,
        }))
        setAllItems([...assetItems, ...creativeItems])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const tabFilter = TAB_FILTER[activeTab]
  const filtered = allItems.filter(item => {
    // Source filter
    if (tabFilter.source === 'asset' && item._source !== 'asset') return false
    if (tabFilter.source === 'creative' && item._source !== 'creative') return false
    // Type filter
    if (tabFilter.types && !tabFilter.types.includes(item.type)) return false
    // Brand filter
    if (brand !== 'All' && item.brand !== brand) return false
    // Search
    if (search) {
      const q = search.toLowerCase()
      if (!item.displayName.toLowerCase().includes(q) && !item.brand.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-portal-accent" />
          <h1 className="text-on-canvas text-2xl font-bold">Product Library</h1>
        </div>
        <span className="text-on-canvas-muted text-sm">{filtered.length} items</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-portal-accent text-white'
                : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + brand filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search library…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {BRANDS.map(b => (
            <button
              key={b}
              onClick={() => setBrand(b)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${brand === b
                  ? 'bg-portal-accent text-white'
                  : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
                }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
          <p>No items found in this section</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <LibraryCard key={`${item._source}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
