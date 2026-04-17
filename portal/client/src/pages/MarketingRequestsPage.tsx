import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Megaphone, ChevronDown, Loader2, Mail, CheckCircle, XCircle, Clock, Stethoscope, Search, Filter } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketingRequest = {
  id: number
  contact_name: string
  business_name: string
  address: string
  requested_items: string
  request_notes: string | null
  status: string
  submitted_at: string
  reviewed_at: string | null
  user_name: string | null
  user_email: string | null
}

type TabKey = 'all' | 'pending' | 'approved' | 'declined' | 'medical'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildMailtoLink(r: MarketingRequest): string {
  const subject = encodeURIComponent(`Re: Sliquid Request — ${r.business_name}`)
  const statusLine = r.status === 'approved'
    ? 'We are pleased to let you know that your request has been approved.'
    : r.status === 'declined'
      ? 'Unfortunately, we are unable to fulfil your request at this time.'
      : 'We have received your request and will follow up shortly.'
  const body = encodeURIComponent(
    `Hi ${r.contact_name},\n\n${statusLine}\n\nRequest details:\n${r.requested_items}\n` +
    (r.request_notes ? `\nNotes: ${r.request_notes}\n` : '') +
    `\nPlease don't hesitate to reach out with any questions.\n\nBest regards,\nTeam Sliquid`
  )
  return `mailto:${r.user_email ?? ''}?subject=${subject}&body=${body}`
}

function matchesSearch(r: MarketingRequest, q: string): boolean {
  if (!q) return true
  const s = q.toLowerCase()
  return (
    r.contact_name.toLowerCase().includes(s) ||
    r.business_name.toLowerCase().includes(s) ||
    (r.user_email ?? '').toLowerCase().includes(s) ||
    (r.user_name ?? '').toLowerCase().includes(s)
  )
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  declined: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
}

// ─── Request list ─────────────────────────────────────────────────────────────

function RequestList({
  requests,
  loading,
  expanded,
  setExpanded,
  updating,
  onStatusChange,
  emptyLabel,
}: {
  requests: MarketingRequest[]
  loading: boolean
  expanded: number | null
  setExpanded: (id: number | null) => void
  updating: number | null
  onStatusChange: (id: number, status: string) => void
  emptyLabel: string
}) {
  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
      </div>
    )
  }
  if (requests.length === 0) {
    return (
      <div className="p-10 text-center">
        <Megaphone className="w-8 h-8 text-on-canvas-muted/30 mx-auto mb-3" />
        <p className="text-on-canvas-muted text-sm">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-portal-border">
      {requests.map(r => (
        <div key={r.id} className="px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-on-canvas font-medium text-sm">{r.contact_name}</p>
                <span className="text-on-canvas-muted text-xs">·</span>
                <p className="text-on-canvas-subtle text-sm">{r.business_name}</p>
                {r.user_email && (
                  <>
                    <span className="text-on-canvas-muted text-xs">·</span>
                    <p className="text-on-canvas-muted text-xs">{r.user_email}</p>
                  </>
                )}
              </div>
              <p className="text-on-canvas-muted text-xs mt-1">{fmt(r.submitted_at)}</p>
              <p className="text-on-canvas-subtle text-sm mt-2 line-clamp-2">{r.requested_items}</p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              {r.user_email && (
                <a
                  href={buildMailtoLink(r)}
                  title={`Email ${r.contact_name}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-portal-border
                             text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500 text-xs transition-colors"
                >
                  <Mail className="w-3 h-3" />
                  Email
                </a>
              )}
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="text-on-canvas-muted hover:text-on-canvas transition-colors"
                title={expanded === r.id ? 'Collapse' : 'Expand'}
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded === r.id ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {expanded === r.id && (
            <div className="mt-4 pt-4 border-t border-portal-border/50 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-1">Address</p>
                  <p className="text-on-canvas-subtle whitespace-pre-line">{r.address}</p>
                </div>
                <div>
                  <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-1">Items Requested</p>
                  <p className="text-on-canvas-subtle">{r.requested_items}</p>
                </div>
                {r.request_notes && (
                  <div className="sm:col-span-2">
                    <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-on-canvas-subtle">{r.request_notes}</p>
                  </div>
                )}
                {r.reviewed_at && (
                  <div>
                    <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-1">Reviewed</p>
                    <p className="text-on-canvas-subtle">{fmt(r.reviewed_at)}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <p className="text-on-canvas-muted text-xs mr-1">Move to:</p>
                {r.status !== 'approved' && (
                  <button
                    onClick={() => onStatusChange(r.id, 'approved')}
                    disabled={updating === r.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40
                               text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Confirm Approved
                  </button>
                )}
                {r.status !== 'pending' && (
                  <button
                    onClick={() => onStatusChange(r.id, 'pending')}
                    disabled={updating === r.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/40
                               text-amber-400 hover:bg-amber-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                    Move to Pending
                  </button>
                )}
                {r.status !== 'declined' && (
                  <button
                    onClick={() => onStatusChange(r.id, 'declined')}
                    disabled={updating === r.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/40
                               text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Decline
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingRequestsPage() {
  const [requests, setRequests] = useState<MarketingRequest[]>([])
  const [medicalRequests, setMedicalRequests] = useState<MarketingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [medicalLoading, setMedicalLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [updating, setUpdating] = useState<number | null>(null)
  const [medicalUpdating, setMedicalUpdating] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSort, setFilterSort] = useState('newest')

  useEffect(() => {
    api.get<MarketingRequest[]>('/retailer/applications')
      .then(setRequests)
      .catch(console.error)
      .finally(() => setLoading(false))

    api.get<MarketingRequest[]>('/medical-marketing/applications')
      .then(setMedicalRequests)
      .catch(console.error)
      .finally(() => setMedicalLoading(false))
  }, [])

  async function handleStatusChange(id: number, status: string) {
    setUpdating(id)
    try {
      await api.put(`/retailer/applications/${id}/status`, { status })
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      setExpanded(null)
      setActiveTab(status as TabKey)
    } catch (err) {
      console.error(err)
    } finally {
      setUpdating(null)
    }
  }

  async function handleMedicalStatusChange(id: number, status: string) {
    setMedicalUpdating(id)
    try {
      await api.put(`/medical-marketing/applications/${id}/status`, { status })
      setMedicalRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      setExpanded(null)
    } catch (err) {
      console.error(err)
    } finally {
      setMedicalUpdating(null)
    }
  }

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    declined: requests.filter(r => r.status === 'declined').length,
    medical:  medicalRequests.length,
  }

  function applyFilters(list: MarketingRequest[], tabStatus?: string) {
    let out = [...list]
    if (tabStatus && tabStatus !== 'all') out = out.filter(r => r.status === tabStatus)
    if (filterStatus) out = out.filter(r => r.status === filterStatus)
    if (search) out = out.filter(r => matchesSearch(r, search))
    out.sort((a, b) => {
      const diff = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      return filterSort === 'newest' ? -diff : diff
    })
    return out
  }

  const visibleRequests = applyFilters(requests, activeTab === 'medical' ? undefined : activeTab)
  const visibleMedical  = applyFilters(medicalRequests)

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'all',      label: 'All',      icon: <Megaphone className="w-3.5 h-3.5" /> },
    { key: 'pending',  label: 'Pending',  icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'approved', label: 'Approved', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { key: 'declined', label: 'Declined', icon: <XCircle className="w-3.5 h-3.5" /> },
    { key: 'medical',  label: 'Medical',  icon: <Stethoscope className="w-3.5 h-3.5" /> },
  ]

  const accentColor = (key: TabKey, isActive: boolean): string => {
    const map: Record<TabKey, string> = {
      all:      isActive ? 'bg-portal-accent/10 border-portal-accent text-portal-accent' : 'bg-surface border-portal-border text-on-canvas-muted hover:border-slate-500',
      pending:  isActive ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-surface border-portal-border text-on-canvas-muted hover:border-amber-500/50',
      approved: isActive ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-surface border-portal-border text-on-canvas-muted hover:border-emerald-500/50',
      declined: isActive ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-surface border-portal-border text-on-canvas-muted hover:border-red-500/50',
      medical:  isActive ? 'bg-rose-500/10 border-rose-500 text-rose-400' : 'bg-surface border-portal-border text-on-canvas-muted hover:border-rose-500/50',
    }
    return map[key]
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-portal-accent" />
          Marketing Requests
        </h1>
        <p className="text-on-canvas-muted text-sm mt-1">
          In-store marketing asset, training, and medical requests submitted by partners.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-5 gap-3">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-colors text-left ${accentColor(tab.key, isActive)}`}
            >
              <div className="flex items-center gap-2">
                {tab.icon}
                <span className="text-xs font-medium">{tab.label}</span>
              </div>
              <span className="text-2xl font-bold leading-none">{counts[tab.key]}</span>
            </button>
          )
        })}
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, business, practice, or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface border border-portal-border
                       text-on-canvas placeholder:text-on-canvas-muted text-sm
                       focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-canvas-muted pointer-events-none" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="pl-8 pr-8 py-2.5 rounded-xl bg-surface border border-portal-border
                       text-on-canvas text-sm focus:outline-none focus:border-portal-accent
                       transition-colors appearance-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </div>

        <select
          value={filterSort}
          onChange={e => setFilterSort(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-surface border border-portal-border
                     text-on-canvas text-sm focus:outline-none focus:border-portal-accent
                     transition-colors appearance-none cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      {/* Requests list */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {activeTab === 'medical' ? (
          <RequestList
            requests={visibleMedical}
            loading={medicalLoading}
            expanded={expanded}
            setExpanded={setExpanded}
            updating={medicalUpdating}
            onStatusChange={handleMedicalStatusChange}
            emptyLabel={(search || filterStatus) ? 'No medical requests match your filters.' : 'No medical requests yet.'}
          />
        ) : (
          <RequestList
            requests={visibleRequests}
            loading={loading}
            expanded={expanded}
            setExpanded={setExpanded}
            updating={updating}
            onStatusChange={handleStatusChange}
            emptyLabel={(search || filterStatus) ? 'No requests match your filters.' : activeTab === 'all' ? 'No requests yet.' : `No ${activeTab} requests.`}
          />
        )}
      </div>
    </div>
  )
}
