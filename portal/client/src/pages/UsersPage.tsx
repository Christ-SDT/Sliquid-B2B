import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { TIER_LABEL } from '@/types'
import { Search, Users } from 'lucide-react'

interface PortalUser {
  id: number
  name: string
  email: string
  company?: string | null
  role: string
  created_at?: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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
          <span className="text-white text-sm font-medium">{user.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">{user.email}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{user.company ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedRole}
            onChange={e => { setSelectedRole(e.target.value); setSaveState('idle'); setErrorMsg('') }}
            className="bg-portal-bg border border-portal-border rounded-lg px-3 py-1.5 text-white text-xs
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
          {saveState === 'saved' && (
            <span className="text-emerald-400 text-xs font-medium">Saved</span>
          )}
          {saveState === 'error' && (
            <span className="text-red-400 text-xs">{errorMsg}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-500 text-xs">{joined}</td>
    </tr>
  )
}

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
        <h1 className="text-white text-2xl font-bold flex items-center gap-3">
          <Users className="w-6 h-6 text-portal-accent" />
          User Management
        </h1>
        <p className="text-slate-500 text-sm mt-1">View and manage all registered portal users.</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or company…"
          className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-white text-sm
                     placeholder:text-slate-600 focus:outline-none focus:border-portal-accent transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-portal-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {search ? 'No users match your search.' : 'No users found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-portal-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Account Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Joined</th>
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

      <p className="text-slate-600 text-xs">{filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}</p>
    </div>
  )
}
