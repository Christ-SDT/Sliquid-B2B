import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Megaphone, ChevronDown, Loader2, Mail } from 'lucide-react'

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

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  declined: 'bg-red-500/15 text-red-400 border-red-500/30',
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [requests, setRequests] = useState<MarketingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    api.get<MarketingRequest[]>('/retailer/applications')
      .then(setRequests)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleStatusChange(id: number, status: string) {
    try {
      await api.put(`/retailer/applications/${id}/status`, { status })
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } catch (err) {
      console.error(err)
    }
  }

  const pending = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-portal-accent" />
            Marketing &amp; Training Requests
          </h1>
          <p className="text-on-canvas-muted text-sm mt-1">
            In-store marketing asset and training requests submitted by partners.
          </p>
        </div>
        {pending > 0 && (
          <span className="flex-shrink-0 px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold rounded-full">
            {pending} pending
          </span>
        )}
      </div>

      {/* Requests list */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center">
            <Megaphone className="w-8 h-8 text-on-canvas-muted/30 mx-auto mb-3" />
            <p className="text-on-canvas-muted text-sm">No requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-portal-border">
            {requests.map(r => (
              <div key={r.id} className="px-6 py-4">
                {/* Row header */}
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
                    {/* Status selector */}
                    <div className="relative">
                      <select
                        value={r.status}
                        onChange={e => handleStatusChange(r.id, e.target.value)}
                        className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg border text-xs font-medium cursor-pointer focus:outline-none transition-colors ${STATUS_STYLES[r.status] ?? STATUS_STYLES.pending}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="declined">Declined</option>
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                    </div>

                    {/* Email button */}
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

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-on-canvas-muted hover:text-on-canvas text-xs underline-offset-2 hover:underline transition-colors"
                    >
                      {expanded === r.id ? 'Less' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expanded === r.id && (
                  <div className="mt-4 pt-4 border-t border-portal-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
