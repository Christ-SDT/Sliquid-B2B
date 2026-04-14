import { useEffect, useState, useMemo } from 'react'
import { api } from '@/api/client'
import { Users, Loader2, CheckCircle, XCircle, UserCheck, Clock, Search, X, Building2, Mail, CalendarDays, ShieldCheck, Stethoscope } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type PartnerUser = {
  id: number
  name: string
  email: string
  company: string | null
  role: string
  created_at: string
  status: string
}

type TabKey = 'all' | 'pending' | 'approved' | 'declined' | 'medical'

const ROLE_OPTIONS = [
  { value: 'tier1', label: 'Retail Store Employee' },
  { value: 'tier2', label: 'Retail Management' },
  { value: 'tier3', label: 'Distributor' },
  { value: 'tier4', label: 'Prospect' },
  { value: 'tier6', label: 'Medical Partner' },
]

const ROLE_LABEL: Record<string, string> = {
  tier1: 'Retail Store Employee',
  tier2: 'Retail Management',
  tier3: 'Distributor',
  tier4: 'Prospect',
  tier5: 'Admin',
  tier6: 'Medical Partner',
  admin: 'Admin',
}

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  classes: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
  active:   { label: 'Approved', classes: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  declined: { label: 'Declined', classes: 'bg-red-500/10 border-red-500/30 text-red-400' },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── User Detail Modal ────────────────────────────────────────────────────────

function UserRequestModal({
  user,
  onClose,
  onApprove,
  onDecline,
  working,
}: {
  user: PartnerUser
  onClose: () => void
  onApprove: (id: number, role: string) => Promise<void>
  onDecline: (id: number) => Promise<void>
  working: boolean
}) {
  const [selectedRole, setSelectedRole] = useState(
    ROLE_OPTIONS.find(o => o.value === user.role) ? user.role : 'tier1'
  )
  const [confirmDecline, setConfirmDecline] = useState(false)

  const statusCfg = STATUS_CONFIG[user.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending

  async function approve() {
    await onApprove(user.id, selectedRole)
    onClose()
  }

  async function decline() {
    if (!confirmDecline) { setConfirmDecline(true); return }
    await onDecline(user.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold text-base">Partner Request</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Avatar + identity */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-portal-accent/20 border border-portal-accent/30
                            flex items-center justify-center text-portal-accent text-xl font-bold flex-shrink-0">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-on-canvas font-semibold text-base">{user.name}</p>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium mt-1 ${statusCfg.classes}`}>
                {user.status === 'pending'  && <Clock className="w-3 h-3" />}
                {user.status === 'active'   && <CheckCircle className="w-3 h-3" />}
                {user.status === 'declined' && <XCircle className="w-3 h-3" />}
                {statusCfg.label}
              </span>
            </div>
          </div>

          {/* Details grid */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-on-canvas-muted flex-shrink-0" />
              <span className="text-on-canvas-subtle">{user.email}</span>
            </div>
            {user.company && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="w-4 h-4 text-on-canvas-muted flex-shrink-0" />
                <span className="text-on-canvas-subtle">{user.company}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <CalendarDays className="w-4 h-4 text-on-canvas-muted flex-shrink-0" />
              <span className="text-on-canvas-subtle">Registered {fmt(user.created_at)}</span>
            </div>
            {user.status === 'active' && (
              <div className="flex items-center gap-3 text-sm">
                <ShieldCheck className="w-4 h-4 text-on-canvas-muted flex-shrink-0" />
                <span className="text-on-canvas-subtle">{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
            )}
          </div>

          {/* Role selector */}
          <div className="space-y-1.5">
            <label className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider">
              Assign Role
            </label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-xl px-3 py-2.5 text-on-canvas text-sm
                         focus:outline-none focus:border-portal-accent transition-colors"
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            {user.status !== 'active' && (
              <button
                onClick={approve}
                disabled={working}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                           bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {user.status === 'declined' ? 'Approve & Activate' : 'Confirm Approved'}
              </button>
            )}

            {user.status === 'active' && (
              <button
                onClick={approve}
                disabled={working}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                           bg-portal-accent/10 border border-portal-accent/40 hover:bg-portal-accent/20
                           disabled:opacity-60 text-portal-accent text-sm font-semibold transition-colors"
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Update Role
              </button>
            )}

            {user.status !== 'declined' && (
              <button
                onClick={decline}
                disabled={working}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                            text-sm font-semibold transition-colors disabled:opacity-60
                            ${confirmDecline
                              ? 'bg-red-600 hover:bg-red-500 text-white'
                              : 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400'}`}
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {confirmDecline ? 'Confirm Decline' : 'Decline'}
              </button>
            )}

            {confirmDecline && (
              <button
                onClick={() => setConfirmDecline(false)}
                className="w-full text-on-canvas-muted text-xs hover:text-on-canvas transition-colors py-1"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [users, setUsers] = useState<PartnerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<PartnerUser | null>(null)

  useEffect(() => {
    api.get<PartnerUser[]>('/admin/users')
      .then(data => {
        setUsers(data.filter(u => u.role !== 'tier5' && u.role !== 'admin'))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleApprove(id: number, role: string) {
    setWorking(id)
    try {
      await api.post(`/admin/users/${id}/approve`, { role })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'active', role } : u))
      setSelectedUser(prev => prev?.id === id ? { ...prev, status: 'active', role } : prev)
    } catch (err) {
      console.error(err)
    } finally {
      setWorking(null)
    }
  }

  async function handleDecline(id: number) {
    setWorking(id)
    try {
      await api.post(`/admin/users/${id}/decline`, {})
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'declined' } : u))
      setSelectedUser(prev => prev?.id === id ? { ...prev, status: 'declined' } : prev)
    } catch (err) {
      console.error(err)
    } finally {
      setWorking(null)
    }
  }

  const counts = {
    all:      users.length,
    pending:  users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'active').length,
    declined: users.filter(u => u.status === 'declined').length,
    medical:  users.filter(u => u.role === 'tier6').length,
  }

  const tabFiltered = useMemo(() => {
    if (activeTab === 'all')      return users
    if (activeTab === 'pending')  return users.filter(u => u.status === 'pending')
    if (activeTab === 'approved') return users.filter(u => u.status === 'active')
    if (activeTab === 'medical')  return users.filter(u => u.role === 'tier6')
    return users.filter(u => u.status === 'declined')
  }, [users, activeTab])

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tabFiltered
    return tabFiltered.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.company ?? '').toLowerCase().includes(q)
    )
  }, [tabFiltered, search])

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'all',      label: 'All',      icon: <Users className="w-3.5 h-3.5" /> },
    { key: 'pending',  label: 'Pending',  icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'approved', label: 'Approved', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    { key: 'declined', label: 'Declined', icon: <XCircle className="w-3.5 h-3.5" /> },
    { key: 'medical',  label: 'Medical',  icon: <Stethoscope className="w-3.5 h-3.5" /> },
  ]

  const tabColors: Record<TabKey, (active: boolean) => string> = {
    all:      a => a ? 'bg-portal-accent/10 border-portal-accent text-portal-accent'  : 'bg-surface border-portal-border text-on-canvas-muted hover:border-slate-500',
    pending:  a => a ? 'bg-amber-500/10 border-amber-500 text-amber-400'               : 'bg-surface border-portal-border text-on-canvas-muted hover:border-amber-500/50',
    approved: a => a ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'         : 'bg-surface border-portal-border text-on-canvas-muted hover:border-emerald-500/50',
    declined: a => a ? 'bg-red-500/10 border-red-500 text-red-400'                     : 'bg-surface border-portal-border text-on-canvas-muted hover:border-red-500/50',
    medical:  a => a ? 'bg-rose-500/10 border-rose-500 text-rose-400'                  : 'bg-surface border-portal-border text-on-canvas-muted hover:border-rose-500/50',
  }

  // Keep modal user in sync if it was updated from outside
  const liveSelectedUser = selectedUser
    ? users.find(u => u.id === selectedUser.id) ?? selectedUser
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-portal-accent" />
          Partner Requests
        </h1>
        <p className="text-on-canvas-muted text-sm mt-1">
          Review and approve new partner registrations.
        </p>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-5 gap-3">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-colors text-left ${tabColors[tab.key](activeTab === tab.key)}`}
          >
            <div className="flex items-center gap-2">
              {tab.icon}
              <span className="text-xs font-medium">{tab.label}</span>
            </div>
            <span className="text-2xl font-bold leading-none">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or company…"
          className="w-full bg-surface border border-portal-border rounded-xl pl-9 pr-4 py-2.5 text-sm
                     text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
        />
      </div>

      {/* List */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-400/40 mx-auto mb-3" />
            <p className="text-on-canvas text-sm font-medium">
              {search ? 'No results match your search.' : activeTab === 'all' ? 'No partner registrations yet.' : `No ${activeTab} registrations.`}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="text-portal-accent text-xs mt-2 hover:underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-portal-border">
            {visibleUsers.map(u => {
              const statusCfg = STATUS_CONFIG[u.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-elevated transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-portal-accent/20 border border-portal-accent/30
                                  flex items-center justify-center text-portal-accent text-sm font-bold flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-on-canvas font-medium text-sm">{u.name}</p>
                    <p className="text-on-canvas-muted text-xs">{u.email}</p>
                    {u.company && (
                      <p className="text-on-canvas-subtle text-xs mt-0.5">{u.company}</p>
                    )}
                    <p className="text-on-canvas-muted text-xs mt-1">Registered {fmt(u.created_at)}</p>
                  </div>

                  {/* Status badge */}
                  <span className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${statusCfg.classes}`}>
                    {u.status === 'pending'  && <Clock className="w-3 h-3" />}
                    {u.status === 'active'   && <CheckCircle className="w-3 h-3" />}
                    {u.status === 'declined' && <XCircle className="w-3 h-3" />}
                    {statusCfg.label}
                    {u.status === 'active' && (
                      <span className="opacity-60 font-normal">· {ROLE_LABEL[u.role] ?? u.role}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 px-4 py-3 bg-portal-bg rounded-xl border border-portal-border text-xs text-on-canvas-muted">
        <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          To manage existing users (change roles, view profiles), visit{' '}
          <a href="/users" className="text-portal-accent hover:underline">User Management</a>.
        </span>
      </div>

      {/* Detail modal */}
      {liveSelectedUser && (
        <UserRequestModal
          user={liveSelectedUser}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onDecline={handleDecline}
          working={working === liveSelectedUser.id}
        />
      )}
    </div>
  )
}
