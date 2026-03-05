import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Search, Users, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface PortalUser {
  id: number
  name: string
  email: string
  company?: string | null
  role: string
  created_at?: string
}

interface WooStatus {
  configured: boolean
  lastPull: { synced_at: string; status: string; products_updated: number; message?: string } | null
  lastPush: { synced_at: string; status: string; products_updated: number; message?: string } | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({ user, onRoleChange }: { user: PortalUser; onRoleChange: (id: number, role: string) => void }) {
  const [selectedRole, setSelectedRole] = useState(user.role)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSave() {
    if (selectedRole === user.role) return
    setSaveState('saving')
    setErrorMsg('')
    try {
      await api.put<PortalUser>(`/admin/users/${user.id}/role`, { role: selectedRole })
      onRoleChange(user.id, selectedRole)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Failed to save')
      setSaveState('error')
    }
  }

  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <tr className="border-b border-portal-border hover:bg-surface-elevated transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                          flex items-center justify-center text-portal-accent text-xs font-bold flex-shrink-0">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <span className="text-on-canvas text-sm font-medium">{user.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-on-canvas-subtle text-sm">{user.email}</td>
      <td className="px-4 py-3 text-on-canvas-subtle text-sm">{user.company ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedRole}
            onChange={e => { setSelectedRole(e.target.value); setSaveState('idle'); setErrorMsg('') }}
            className="bg-portal-bg border border-portal-border rounded-lg px-3 py-1.5 text-on-canvas text-xs
                       focus:outline-none focus:border-portal-accent transition-colors"
          >
            <option value="tier1">Tier 1 (Retail Store Employee)</option>
            <option value="tier2">Tier 2 (Ecommerce)</option>
            <option value="tier3">Tier 3 (Distributor)</option>
            <option value="tier4">Admin</option>
          </select>
          {selectedRole !== user.role && (
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                         text-white text-xs font-medium rounded-lg transition-colors"
            >
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </button>
          )}
          {saveState === 'saved' && <span className="text-emerald-400 text-xs font-medium">Saved</span>}
          {saveState === 'error' && <span className="text-red-400 text-xs">{errorMsg}</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-on-canvas-muted text-xs">{joined}</td>
    </tr>
  )
}

// ─── WooCommerce Panel ────────────────────────────────────────────────────────

function WooPanel() {
  const [wooStatus, setWooStatus] = useState<WooStatus | null>(null)
  const [wooLoading, setWooLoading] = useState(true)

  const [url, setUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [credSaveState, setCredSaveState] = useState<SaveState>('idle')
  const [credError, setCredError] = useState('')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  function fetchStatus() {
    setWooLoading(true)
    api.get<WooStatus>('/woo/status')
      .then(setWooStatus)
      .catch(console.error)
      .finally(() => setWooLoading(false))
  }

  useEffect(fetchStatus, [])

  async function handleSaveCreds() {
    setCredSaveState('saving')
    setCredError('')
    try {
      await api.post('/woo/settings', {
        url: url.trim(),
        consumer_key: consumerKey.trim(),
        consumer_secret: consumerSecret.trim(),
      })
      setCredSaveState('saved')
      setTimeout(() => setCredSaveState('idle'), 2500)
      fetchStatus()
    } catch (e: any) {
      setCredError(e.message ?? 'Failed to save')
      setCredSaveState('error')
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.post<{ ok: boolean; error?: string }>('/woo/test', {})
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await api.post<{ products_updated: number; status: string }>('/woo/sync', {})
      setSyncMsg(
        result.status === 'ok'
          ? `Pulled ${result.products_updated} product${result.products_updated !== 1 ? 's' : ''} from WooCommerce`
          : 'Sync completed with errors'
      )
      fetchStatus()
    } catch (e: any) {
      setSyncMsg(e.message ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function relativeTime(isoStr: string): string {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-on-canvas font-bold text-lg">WooCommerce Sync</h2>
          <p className="text-on-canvas-muted text-sm mt-0.5">Connect your WooCommerce store to sync inventory</p>
        </div>
        {!wooLoading && wooStatus && (
          <div className="flex items-center gap-2">
            {wooStatus.configured ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-on-canvas-muted text-sm">
                <XCircle className="w-4 h-4" />
                Not Configured
              </span>
            )}
          </div>
        )}
      </div>

      {/* Last sync info */}
      {wooStatus?.lastPull && (
        <div className="bg-portal-bg rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-on-canvas-subtle text-xs">Last pull</p>
            <p className="text-on-canvas text-sm font-medium mt-0.5">
              {relativeTime(wooStatus.lastPull.synced_at)}
              {' · '}
              <span className={wooStatus.lastPull.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                {wooStatus.lastPull.status}
              </span>
              {' · '}
              <span className="text-on-canvas-subtle">{wooStatus.lastPull.products_updated} updated</span>
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleTest}
          disabled={testing || !wooStatus?.configured}
          className="flex items-center gap-2 px-4 py-2 border border-portal-border text-on-canvas-subtle
                     hover:text-on-canvas hover:border-slate-500 disabled:opacity-40 rounded-lg text-sm transition-colors"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Test Connection
        </button>
        <button
          onClick={handleSync}
          disabled={syncing || !wooStatus?.configured}
          className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                     disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
        {syncMsg && <p className="text-on-canvas-subtle text-sm self-center">{syncMsg}</p>}
      </div>

      {testResult && (
        <div className={`rounded-lg px-4 py-3 text-sm ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
        </div>
      )}

      {/* Credentials form */}
      <div className="border-t border-portal-border pt-5 space-y-4">
        <p className="text-on-canvas-subtle text-sm font-medium">
          {wooStatus?.configured ? 'Update Credentials' : 'Enter Credentials'}
        </p>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">WooCommerce Store URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-store.com"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">Consumer Key</label>
            <input
              type="text"
              value={consumerKey}
              onChange={e => setConsumerKey(e.target.value)}
              placeholder="ck_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors font-mono"
            />
          </div>
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">Consumer Secret</label>
            <input
              type="password"
              value={consumerSecret}
              onChange={e => setConsumerSecret(e.target.value)}
              placeholder="cs_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors font-mono"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveCreds}
            disabled={credSaveState === 'saving' || !url || !consumerKey || !consumerSecret}
            className="px-5 py-2.5 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-40
                       text-white rounded-lg text-sm font-medium transition-colors"
          >
            {credSaveState === 'saving' ? 'Saving…' : 'Save Credentials'}
          </button>
          {credSaveState === 'saved' && (
            <span className="text-emerald-400 text-sm flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          {credSaveState === 'error' && <span className="text-red-400 text-sm">{credError}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get<PortalUser[]>('/admin/users')
      .then(setUsers)
      .catch(err => setError(err.message ?? 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  function handleRoleChange(id: number, role: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
  }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.company ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
          <Users className="w-6 h-6 text-portal-accent" />
          User Management
        </h1>
        <p className="text-on-canvas-muted text-sm mt-1">View and manage all registered portal users.</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or company…"
          className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
        />
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-on-canvas-muted text-sm">
            {search ? 'No users match your search.' : 'No users found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-portal-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Account Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <UserRow key={user.id} user={user} onRoleChange={handleRoleChange} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-on-canvas-muted text-xs">{filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}</p>

      {/* WooCommerce Panel */}
      <WooPanel />
    </div>
  )
}
