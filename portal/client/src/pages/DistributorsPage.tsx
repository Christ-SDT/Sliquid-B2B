import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Distributor } from '@/types'
import { Search, MapPin, Phone, Mail, Globe, Send } from 'lucide-react'

const REGIONS = ['All', 'Northeast', 'Southeast', 'Midwest', 'Mountain West', 'Southwest', 'Northwest', 'West']

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [loading, setLoading] = useState(true)
  const [region, setRegion] = useState('All')
  const [search, setSearch] = useState('')
  const [requested, setRequested] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (region !== 'All') params.set('region', region)
    if (search) params.set('search', search)
    api.get<Distributor[]>(`/distributors?${params}`)
      .then(setDistributors)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [region, search])

  function requestIntro(id: number) {
    setRequested(prev => new Set([...prev, id]))
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-white text-2xl font-bold">Distributors</h1>
        <p className="text-slate-500 text-sm mt-1">Find authorized Sliquid distribution partners in your area.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city, or state…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-white text-sm
                       placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={region}
          onChange={e => setRegion(e.target.value)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2.5 text-white text-sm
                     focus:outline-none focus:border-portal-accent transition-colors"
        >
          {REGIONS.map(r => <option key={r} value={r}>{r === 'All' ? 'All Regions' : r}</option>)}
        </select>
      </div>

      <div className="text-slate-500 text-sm">{distributors.length} distributors found</div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : distributors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <MapPin className="w-12 h-12 mb-3 opacity-40" />
          <p>No distributors found for this region</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {distributors.map(d => (
            <div key={d.id} className="bg-surface border border-portal-border rounded-xl p-5 hover:border-portal-accent/30 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{d.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-500 text-xs">{d.city ? `${d.city}, ` : ''}{d.state}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-portal-accent/10 text-portal-accent rounded-full text-xs font-medium">
                  {d.region}
                </span>
              </div>

              {d.contact_name && (
                <p className="text-slate-400 text-sm mb-3">Contact: <span className="text-white">{d.contact_name}</span></p>
              )}

              <div className="space-y-1.5 mb-4">
                {d.phone && (
                  <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-slate-400 hover:text-white text-xs transition-colors">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {d.phone}
                  </a>
                )}
                {d.email && (
                  <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-slate-400 hover:text-white text-xs transition-colors">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    {d.email}
                  </a>
                )}
                {d.website && (
                  <a href={d.website} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2 text-slate-400 hover:text-portal-accent text-xs transition-colors">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    {d.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              <button
                onClick={() => requestIntro(d.id)}
                disabled={requested.has(d.id)}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors
                  ${requested.has(d.id)
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-portal-accent/10 hover:bg-portal-accent/20 text-portal-accent'
                  }`}
              >
                <Send className="w-3.5 h-3.5" />
                {requested.has(d.id) ? 'Intro Requested!' : 'Request Introduction'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
