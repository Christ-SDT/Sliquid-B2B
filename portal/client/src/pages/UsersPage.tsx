import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { TIER_LABEL } from '@/types'
import {
  Search, Users, RefreshCw, CheckCircle, XCircle, Loader2, Cpu,
  X, Award, GraduationCap, ExternalLink, ShieldCheck,
} from 'lucide-react'

interface PortalUser {
  id: number
  name: string
  email: string
  company?: string | null
  role: string
  created_at?: string
  last_login?: string | null
  certificate_number?: string | null
}

interface WooStatus {
  configured: boolean
  lastPull: { synced_at: string; status: string; products_updated: number; message?: string } | null
  lastPush: { synced_at: string; status: string; products_updated: number; message?: string } | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Store { id: number; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null, fallback = '—') {
  if (!iso) return fallback
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function relativeTime(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function roleBadgeClass(role: string) {
  switch (role) {
    case 'tier5': return 'bg-violet-600 border-violet-600 text-white'
    case 'tier4': return 'bg-orange-500 border-orange-500 text-white'
    case 'tier3': return 'bg-cyan-600 border-cyan-600 text-white'
    case 'tier2': return 'bg-emerald-600 border-emerald-600 text-white'
    default:      return 'bg-slate-500 border-slate-500 text-white'
  }
}

// ─── User Detail Modal ────────────────────────────────────────────────────────

function UserDetailModal({
  user,
  stores,
  onClose,
  onRoleChange,
  onCompanyChange,
}: {
  user: PortalUser
  stores: Store[]
  onClose: () => void
  onRoleChange: (id: number, role: string) => void
  onCompanyChange: (id: number, company: string) => void
}) {
  const [selectedRole, setSelectedRole]       = useState(user.role)
  const [roleSaveState, setRoleSaveState]     = useState<SaveState>('idle')
  const [roleError, setRoleError]             = useState('')

  const [selectedCompany, setSelectedCompany]     = useState(user.company ?? '')
  const [companySaveState, setCompanySaveState]   = useState<SaveState>('idle')
  const [companyError, setCompanyError]           = useState('')

  const roleChanged    = selectedRole    !== user.role
  const companyChanged = selectedCompany !== (user.company ?? '')

  async function saveRole() {
    setRoleSaveState('saving')
    setRoleError('')
    try {
      await api.put<PortalUser>(`/admin/users/${user.id}/role`, { role: selectedRole })
      onRoleChange(user.id, selectedRole)
      setRoleSaveState('saved')
      setTimeout(() => setRoleSaveState('idle'), 2000)
    } catch (err: any) {
      setRoleError(err.message ?? 'Failed to save')
      setRoleSaveState('error')
    }
  }

  async function saveCompany() {
    setCompanySaveState('saving')
    setCompanyError('')
    try {
      await api.put(`/admin/users/${user.id}/company`, { company: selectedCompany })
      onCompanyChange(user.id, selectedCompany)
      setCompanySaveState('saved')
      setTimeout(() => setCompanySaveState('idle'), 2000)
    } catch (err: any) {
      setCompanyError(err.message ?? 'Failed to save')
      setCompanySaveState('error')
    }
  }

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">User Profile</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">

          {/* ── Identity ── */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-portal-accent/20 border-2 border-portal-accent/30
                            flex items-center justify-center text-portal-accent text-lg font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-on-canvas font-bold text-lg leading-tight truncate">{user.name}</h3>
              <p className="text-on-canvas-muted text-sm truncate">{user.email}</p>
              <span className={`mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${roleBadgeClass(user.role)}`}>
                {TIER_LABEL[user.role] ?? user.role}
              </span>
            </div>
          </div>

          {/* ── Details grid ── */}
          <div className="bg-portal-bg rounded-xl border border-portal-border divide-y divide-portal-border">

            {/* Date Joined */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-on-canvas-muted text-sm">Date Joined</span>
              <span className="text-on-canvas text-sm font-medium">{formatDate(user.created_at)}</span>
            </div>

            {/* Last Login */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-on-canvas-muted text-sm">Last Login</span>
              <span className="text-on-canvas text-sm font-medium">
                {user.last_login
                  ? `${formatDate(user.last_login)} · ${relativeTime(user.last_login)}`
                  : 'Never'}
              </span>
            </div>

          </div>

          {/* ── Editable: Store / Company ── */}
          <div>
            <label className="block text-on-canvas-subtle text-xs font-medium mb-2">Store / Company</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedCompany}
                onChange={e => { setSelectedCompany(e.target.value); setCompanySaveState('idle'); setCompanyError('') }}
                className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2
                           text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
              >
                <option value="">— no company —</option>
                {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              {companyChanged && (
                <button
                  onClick={saveCompany}
                  disabled={companySaveState === 'saving'}
                  className="px-3 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                             text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  {companySaveState === 'saving' ? 'Saving…' : 'Save'}
                </button>
              )}
              {companySaveState === 'saved'  && <span className="text-emerald-400 text-xs font-medium flex-shrink-0">Saved</span>}
              {companySaveState === 'error'  && <span className="text-red-400 text-xs flex-shrink-0">{companyError}</span>}
            </div>
          </div>

          {/* ── Editable: Account Type ── */}
          <div>
            <label className="block text-on-canvas-subtle text-xs font-medium mb-2">Account Type</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedRole}
                onChange={e => { setSelectedRole(e.target.value); setRoleSaveState('idle'); setRoleError('') }}
                className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2
                           text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
              >
                <option value="tier1">Retail Store Employee</option>
                <option value="tier2">Retail Management</option>
                <option value="tier3">Distributor</option>
                <option value="tier4">Prospect</option>
                <option value="tier5">Admin</option>
              </select>
              {roleChanged && (
                <button
                  onClick={saveRole}
                  disabled={roleSaveState === 'saving'}
                  className="px-3 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                             text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  {roleSaveState === 'saving' ? 'Saving…' : 'Save'}
                </button>
              )}
              {roleSaveState === 'saved' && <span className="text-emerald-400 text-xs font-medium flex-shrink-0">Saved</span>}
              {roleSaveState === 'error' && <span className="text-red-400 text-xs flex-shrink-0">{roleError}</span>}
            </div>
          </div>

          {/* ── Certification ── */}
          <div>
            <label className="block text-on-canvas-subtle text-xs font-medium mb-2">Certification</label>
            {user.certificate_number ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3
                              bg-emerald-900/15 border border-emerald-700/30 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <Award className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-emerald-400 text-sm font-semibold">Sliquid Certified Expert</p>
                    <p className="text-emerald-600/80 text-xs font-mono mt-0.5 truncate">
                      {user.certificate_number}
                    </p>
                  </div>
                </div>
                <a
                  href="/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50
                             border border-emerald-700/40 rounded-lg text-emerald-400 text-xs font-medium
                             transition-colors flex-shrink-0"
                >
                  Verify <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3
                              bg-surface-elevated border border-portal-border rounded-xl">
                <GraduationCap className="w-5 h-5 text-on-canvas-muted flex-shrink-0" />
                <div>
                  <p className="text-on-canvas-subtle text-sm font-medium">Training Not Completed</p>
                  <p className="text-on-canvas-muted text-xs mt-0.5">
                    No certificate has been issued for this user yet.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onClick,
}: {
  user: PortalUser
  onClick: () => void
}) {
  const joined = formatDate(user.created_at, '—')

  return (
    <tr
      onClick={onClick}
      className="border-b border-portal-border hover:bg-surface-elevated transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                          flex items-center justify-center text-portal-accent text-xs font-bold flex-shrink-0">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-on-canvas text-sm font-medium">{user.name}</span>
            {user.certificate_number && (
              <span className="px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-700/40
                               rounded text-emerald-400 text-[10px] font-medium">
                Certified
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-on-canvas-subtle text-sm">{user.email}</td>
      <td className="px-4 py-3 text-on-canvas-subtle text-sm">{user.company ?? '—'}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${roleBadgeClass(user.role)}`}>
          {TIER_LABEL[user.role] ?? user.role}
        </span>
      </td>
      <td className="px-4 py-3 text-on-canvas-muted text-xs">{joined}</td>
    </tr>
  )
}

// ─── AI Model Panel ───────────────────────────────────────────────────────────

const AI_MODELS = [
  {
    id: 'imagen-3.0-generate-002',
    label: 'Imagen 3',
    description: 'Stable · Original model · Best reliability',
  },
  {
    id: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Flash',
    description: 'Vision-aware · Sends actual product label images as visual reference',
  },
]

function AiModelPanel() {
  const [activeModel, setActiveModel] = useState('imagen-3.0-generate-002')
  const [selected, setSelected] = useState('imagen-3.0-generate-002')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    api.get<{ model: string }>('/creator/settings')
      .then(r => { setActiveModel(r.model); setSelected(r.model) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaveState('saving')
    try {
      await api.post('/creator/settings', { model: selected })
      setActiveModel(selected)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
    }
  }

  const isDirty = selected !== activeModel

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Cpu className="w-5 h-5 text-portal-accent flex-shrink-0" />
        <div>
          <h2 className="text-on-canvas font-bold text-lg">AI Image Model</h2>
          <p className="text-on-canvas-muted text-sm mt-0.5">Select which model powers the AI Creator</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-canvas-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors ${
                selected === m.id
                  ? 'border-portal-accent bg-portal-accent/10'
                  : 'border-portal-border hover:border-slate-500 bg-portal-bg'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-semibold ${selected === m.id ? 'text-portal-accent' : 'text-on-canvas'}`}>
                    {m.label}
                  </p>
                  <p className="text-on-canvas-muted text-xs mt-0.5">{m.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {activeModel === m.id && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                  )}
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selected === m.id ? 'border-portal-accent' : 'border-portal-border'
                  }`}>
                    {selected === m.id && <div className="w-2 h-2 rounded-full bg-portal-accent" />}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!isDirty || saveState === 'saving'}
          className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                     disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saveState === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveState === 'saving' ? 'Saving…' : 'Apply Model'}
        </button>
        {saveState === 'saved' && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
            <CheckCircle className="w-4 h-4" /> Saved
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1.5 text-red-400 text-sm">
            <XCircle className="w-4 h-4" /> Failed to save
          </span>
        )}
      </div>
    </div>
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

  function wooRelativeTime(isoStr: string): string {
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
                <CheckCircle className="w-4 h-4" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-on-canvas-muted text-sm">
                <XCircle className="w-4 h-4" /> Not Configured
              </span>
            )}
          </div>
        )}
      </div>

      {wooStatus?.lastPull && (
        <div className="bg-portal-bg rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-on-canvas-subtle text-xs">Last pull</p>
            <p className="text-on-canvas text-sm font-medium mt-0.5">
              {wooRelativeTime(wooStatus.lastPull.synced_at)}
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

      <div className="border-t border-portal-border pt-5 space-y-4">
        <p className="text-on-canvas-subtle text-sm font-medium">
          {wooStatus?.configured ? 'Update Credentials' : 'Enter Credentials'}
        </p>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">WooCommerce Store URL</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-store.com"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors" />
          </div>
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">Consumer Key</label>
            <input type="text" value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="ck_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors font-mono" />
          </div>
          <div>
            <label className="text-on-canvas-muted text-xs mb-1.5 block">Consumer Secret</label>
            <input type="password" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder="cs_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors font-mono" />
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
  const [users, setUsers]   = useState<PortalUser[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<PortalUser[]>('/admin/users'),
      api.get<Store[]>('/stores'),
    ])
      .then(([u, s]) => { setUsers(u); setStores(s) })
      .catch(err => setError(err.message ?? 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  function handleRoleChange(id: number, role: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))
    setSelectedUser(prev => prev?.id === id ? { ...prev, role } : prev)
  }

  function handleCompanyChange(id: number, company: string) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, company } : u))
    setSelectedUser(prev => prev?.id === id ? { ...prev, company } : prev)
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

  const certifiedCount = users.filter(u => u.certificate_number).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
            <Users className="w-6 h-6 text-portal-accent" />
            User Management
          </h1>
          <p className="text-on-canvas-muted text-sm mt-1">
            View and manage all registered portal users.
            {certifiedCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                {certifiedCount} certified
              </span>
            )}
          </p>
        </div>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Store / Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Account Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onClick={() => setSelectedUser(user)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-on-canvas-muted text-xs">
        {filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}
        {' · '}Click any row to view details
      </p>

      {/* WooCommerce Panel */}
      <WooPanel />

      {/* AI Model Panel */}
      <AiModelPanel />

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          stores={stores}
          onClose={() => setSelectedUser(null)}
          onRoleChange={handleRoleChange}
          onCompanyChange={handleCompanyChange}
        />
      )}
    </div>
  )
}
