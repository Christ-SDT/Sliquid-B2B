import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Users, Loader2, CheckCircle, XCircle, UserCheck } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingUser = {
  id: number
  name: string
  email: string
  company: string | null
  role: string
  created_at: string
  status: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [working, setWorking] = useState<number | null>(null)

  useEffect(() => {
    api.get<PendingUser[]>('/admin/users?status=pending')
      .then(data => setUsers(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleApprove(id: number) {
    setWorking(id)
    try {
      await api.post(`/admin/users/${id}/approve`, {})
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setWorking(null)
    }
  }

  async function handleDecline(id: number) {
    if (confirming !== id) {
      setConfirming(id)
      return
    }
    setWorking(id)
    try {
      await api.post(`/admin/users/${id}/decline`, {})
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setWorking(null)
      setConfirming(null)
    }
  }

  const pendingCount = users.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
            <UserCheck className="w-6 h-6 text-portal-accent" />
            Partner Requests
          </h1>
          <p className="text-on-canvas-muted text-sm mt-1">
            Review and approve new partner registrations.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="flex-shrink-0 px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-sm font-semibold rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* List */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-400/40 mx-auto mb-3" />
            <p className="text-on-canvas text-sm font-medium">No pending registrations</p>
            <p className="text-on-canvas-muted text-xs mt-1">All caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-portal-border">
            {users.map(u => (
              <div key={u.id} className="px-6 py-4">
                <div className="flex items-start gap-4 flex-wrap">
                  {/* User info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-portal-accent/20 border border-portal-accent/30
                                    flex items-center justify-center text-portal-accent text-sm font-bold flex-shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-on-canvas font-medium text-sm">{u.name}</p>
                      <p className="text-on-canvas-muted text-xs">{u.email}</p>
                      {u.company && (
                        <p className="text-on-canvas-subtle text-xs mt-0.5">{u.company}</p>
                      )}
                      <p className="text-on-canvas-muted text-xs mt-1">Registered {fmt(u.created_at)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <button
                      onClick={() => handleApprove(u.id)}
                      disabled={working === u.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500
                                 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                    >
                      {working === u.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      Approve
                    </button>

                    <button
                      onClick={() => handleDecline(u.id)}
                      disabled={working === u.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60
                        ${confirming === u.id
                          ? 'bg-red-600 border-red-600 text-white hover:bg-red-500'
                          : 'border-portal-border text-on-canvas-subtle hover:text-red-400 hover:border-red-500/50'}`}
                    >
                      <XCircle className="w-3 h-3" />
                      {confirming === u.id ? 'Confirm Decline' : 'Decline'}
                    </button>

                    {confirming === u.id && (
                      <button
                        onClick={() => setConfirming(null)}
                        className="text-on-canvas-muted text-xs hover:text-on-canvas transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users list note */}
      <div className="flex items-start gap-2 px-4 py-3 bg-portal-bg rounded-xl border border-portal-border text-xs text-on-canvas-muted">
        <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          To manage existing users (change roles, view profiles), visit{' '}
          <a href="/users" className="text-portal-accent hover:underline">User Management</a>.
        </span>
      </div>
    </div>
  )
}
