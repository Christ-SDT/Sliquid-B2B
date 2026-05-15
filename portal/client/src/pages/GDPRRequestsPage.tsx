import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { ShieldCheck, Clock, CheckCircle, Loader2, AlertCircle, RefreshCw, Send, Trash2 } from 'lucide-react'

type RequestStatus = 'pending' | 'in_progress' | 'completed'
type RequestType   = 'access' | 'deletion'

interface GDPRRequest {
  id: number
  type: RequestType
  name: string
  email: string
  message: string | null
  status: RequestStatus
  submitted_at: string
  completed_at: string | null
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  pending:     'bg-amber-500/20 text-amber-400 border-amber-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

const TYPE_COLORS: Record<RequestType, string> = {
  access:   'bg-purple-500/20 text-purple-400',
  deletion: 'bg-red-500/20 text-red-400',
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(s: string) {
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000)
  if (diff < 60)   return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function GDPRRequestsPage() {
  const [requests, setRequests] = useState<GDPRRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState<RequestStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<RequestType | 'all'>('all')
  const [updating, setUpdating] = useState<number | null>(null)
  const [actionResult, setActionResult] = useState<{ id: number; message: string; dataSummary?: string } | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterType   !== 'all') params.set('type',   filterType)
      const data = await api.get<GDPRRequest[]>(`/gdpr/requests${params.size ? `?${params}` : ''}`)
      setRequests(data)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus, filterType]) // eslint-disable-line

  async function updateStatus(id: number, status: RequestStatus) {
    setUpdating(id)
    try {
      const updated = await api.put<GDPRRequest>(`/gdpr/requests/${id}/status`, { status })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
    } catch (e: any) {
      alert(e.message ?? 'Failed to update')
    } finally {
      setUpdating(null)
    }
  }

  async function sendData(id: number) {
    if (!confirm('This will email the user a copy of all data held for their email address. Continue?')) return
    setUpdating(id)
    try {
      const result = await api.post<{ ok: boolean; emailSent: boolean; dataSummary?: string }>(`/gdpr/requests/${id}/send-data`, {})
      if (result.emailSent) {
        setActionResult({ id, message: 'Data emailed to the requester and request marked complete.' })
      } else {
        setActionResult({ id, message: 'EmailJS not configured. Copy the data below and send it manually.', dataSummary: result.dataSummary })
      }
      await load()
    } catch (e: any) {
      setActionResult({ id, message: `Error: ${e.message ?? 'Failed to retrieve data'}` })
    } finally {
      setUpdating(null)
    }
  }

  async function deleteData(id: number, name: string) {
    if (!confirm(`Permanently delete all data for ${name}? This will remove them from Mailchimp and anonymize their portal account. This cannot be undone.`)) return
    setUpdating(id)
    try {
      const result = await api.post<{ ok: boolean; results: Record<string, string> }>(`/gdpr/requests/${id}/delete-data`, {})
      const summary = Object.entries(result.results).map(([k, v]) => `${k}: ${v}`).join(', ')
      setActionResult({ id, message: `Deletion complete. ${summary}` })
      await load()
    } catch (e: any) {
      setActionResult({ id, message: `Error: ${e.message ?? 'Failed to delete data'}` })
    } finally {
      setUpdating(null)
    }
  }

  const pending  = requests.filter(r => r.status === 'pending').length
  const inProg   = requests.filter(r => r.status === 'in_progress').length

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-portal-accent" />
          </div>
          <div>
            <h1 className="text-on-canvas text-xl font-bold">GDPR Requests</h1>
            <p className="text-on-canvas-muted text-sm">Data access and deletion requests</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas border border-portal-border rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: requests.length, color: 'text-on-canvas' },
          { label: 'Pending', value: pending, color: 'text-amber-400' },
          { label: 'In Progress', value: inProg, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-portal-border rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-on-canvas-muted text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* GDPR deadline notice */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-300 text-xs leading-relaxed">
          Under GDPR, access and deletion requests must be fulfilled within <strong>30 days</strong> of receipt.
          Access requests: provide a copy of all data held. Deletion requests: remove from Mailchimp audience
          and our internal database, and confirm to the requester.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent">
          <option value="all">All Types</option>
          <option value="access">Access</option>
          <option value="deletion">Deletion</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-portal-accent animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20">
          <ShieldCheck className="w-10 h-10 text-on-canvas-muted/30 mx-auto mb-3" />
          <p className="text-on-canvas-muted text-sm">No requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-surface border border-portal-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">

                {/* Left: info */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${TYPE_COLORS[r.type]}`}>
                      {r.type === 'access' ? 'Data Access' : 'Deletion'}
                    </span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <p className="text-on-canvas font-semibold">{r.name}</p>
                  <a href={`mailto:${r.email}`} className="text-portal-accent text-sm hover:underline">{r.email}</a>
                  {r.message && (
                    <p className="text-on-canvas-muted text-xs leading-relaxed max-w-xl">{r.message}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-on-canvas-muted text-xs">
                    <Clock className="w-3 h-3" />
                    <span>{fmtDate(r.submitted_at)}</span>
                    <span className="text-on-canvas-muted/50">·</span>
                    <span>{timeAgo(r.submitted_at)}</span>
                  </div>
                  {r.completed_at && (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                      <CheckCircle className="w-3 h-3" />
                      <span>Completed {fmtDate(r.completed_at)}</span>
                    </div>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex flex-col gap-2 flex-shrink-0 min-w-[160px]">
                  {/* Primary action based on request type */}
                  {r.status !== 'completed' && r.type === 'access' && (
                    <button
                      onClick={() => sendData(r.id)}
                      disabled={updating === r.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Send Data to User
                    </button>
                  )}
                  {r.status !== 'completed' && r.type === 'deletion' && (
                    <button
                      onClick={() => deleteData(r.id, r.name)}
                      disabled={updating === r.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete User Data
                    </button>
                  )}
                  {/* Status controls */}
                  {r.status !== 'completed' && (
                    <div className="flex gap-1.5">
                      {r.status === 'pending' && (
                        <button
                          onClick={() => updateStatus(r.id, 'in_progress')}
                          disabled={updating === r.id}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          In Progress
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(r.id, 'completed')}
                        disabled={updating === r.id}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Complete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action result panel */}
      {actionResult && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
          <div className="bg-surface border border-portal-border rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-5 py-4 border-b border-portal-border flex items-center justify-between">
              <h3 className="text-on-canvas font-semibold">Action Result</h3>
              <button onClick={() => setActionResult(null)} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-on-canvas-subtle text-sm leading-relaxed">{actionResult.message}</p>
              {actionResult.dataSummary && (
                <div>
                  <p className="text-on-canvas-muted text-xs font-semibold uppercase tracking-wider mb-2">
                    Data Summary (copy and email to user manually)
                  </p>
                  <pre className="bg-portal-bg border border-portal-border rounded-lg p-3 text-on-canvas text-xs leading-relaxed overflow-y-auto max-h-72 whitespace-pre-wrap">
                    {actionResult.dataSummary}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-portal-border flex justify-end">
              <button
                onClick={() => setActionResult(null)}
                className="px-5 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
