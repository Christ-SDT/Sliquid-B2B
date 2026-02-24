import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Creative } from '@/types'
import { Search, Megaphone, Download, Video, FileImage, Mail, Printer } from 'lucide-react'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const TYPES = ['All', 'Banner', 'Social Media', 'Email', 'Print', 'Multi', 'Video']

const TYPE_ICONS: Record<string, any> = {
  Banner: FileImage,
  'Social Media': Megaphone,
  Email: Mail,
  Print: Printer,
  Multi: Megaphone,
  Video: Video,
}

const SUB_SECTIONS = [
  { key: 'current', label: 'Current Campaigns', types: ['Banner', 'Multi'] },
  { key: 'coop', label: 'Co-op Materials', types: ['Print', 'Email'] },
  { key: 'social', label: 'Social Toolkit', types: ['Social Media'] },
  { key: 'video', label: 'Video Assets', types: ['Video'] },
]

function CreativeCard({ item }: { item: Creative }) {
  const Icon = TYPE_ICONS[item.type] ?? Megaphone
  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group">
      <div className="aspect-video bg-portal-bg flex items-center justify-center relative">
        {item.thumbnail_url
          ? <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <Icon className="w-12 h-12 text-slate-700" />
        }
        <div className="absolute top-2 left-2">
          <span className="px-2 py-1 bg-portal-accent/90 rounded text-[10px] text-white font-medium">{item.type}</span>
        </div>
      </div>
      <div className="p-4">
        <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{item.brand}</span>
        <h3 className="text-white text-sm font-medium mt-0.5 leading-snug">{item.title}</h3>
        {item.description && <p className="text-slate-500 text-xs mt-1 line-clamp-2">{item.description}</p>}
        <div className="flex items-center gap-3 mt-2">
          {item.dimensions && <span className="text-slate-600 text-xs">{item.dimensions}</span>}
          {item.file_size && <span className="text-slate-600 text-xs">{item.file_size}</span>}
        </div>
        <a
          href={item.file_url}
          download
          className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                     text-portal-accent rounded-lg text-xs font-medium transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
      </div>
    </div>
  )
}

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('All')
  const [type, setType] = useState('All')
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('current')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (brand !== 'All') params.set('brand', brand)
    if (type !== 'All') params.set('type', type)
    if (search) params.set('search', search)
    api.get<Creative[]>(`/creatives?${params}`)
      .then(setCreatives)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [brand, type, search])

  const activeSubSection = SUB_SECTIONS.find(s => s.key === activeSection)
  const filtered = creatives.filter(c =>
    activeSubSection ? activeSubSection.types.includes(c.type) : true
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-white text-2xl font-bold">Creatives</h1>
        <p className="text-slate-500 text-sm mt-1">Campaign materials, social assets, and marketing collateral.</p>
      </div>

      {/* Sub-section tabs */}
      <div className="flex gap-2 flex-wrap">
        {SUB_SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeSection === s.key
                ? 'bg-portal-accent text-white'
                : 'bg-surface border border-portal-border text-slate-400 hover:text-white hover:border-slate-500'
              }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search creatives…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
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
                  : 'bg-surface border border-portal-border text-slate-400 hover:text-white'
                }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <Megaphone className="w-12 h-12 mb-3 opacity-40" />
          <p>No creatives found in this section</p>
          <p className="text-xs mt-1">Check back as new campaigns are added regularly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => <CreativeCard key={c.id} item={c} />)}
        </div>
      )}
    </div>
  )
}
