import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Users, Search, CheckCircle } from 'lucide-react'
import { TIER_LABEL } from '@/types'

interface StoreMember {
  id: number
  name: string
  email: string
  company?: string | null
  role: string
  created_at?: string
  quizzes_total: number
  quizzes_passed: number
}

export default function StoreUsersPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState<StoreMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get<StoreMember[]>('/store/members')
      .then(setMembers)
      .catch(err => setError(err.message ?? 'Failed to load store members'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = members.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-on-canvas text-2xl font-bold flex items-center gap-3">
          <Users className="w-6 h-6 text-portal-accent" />
          My Store
        </h1>
        <p className="text-on-canvas-muted text-sm mt-1">
          {user?.company
            ? `Members registered under ${user.company}`
            : 'Members registered at your store'}
        </p>
      </div>

      {/* Stats row */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-surface border border-portal-border rounded-xl px-5 py-4">
            <p className="text-on-canvas-muted text-xs mb-1">Total Members</p>
            <p className="text-on-canvas text-2xl font-bold">{members.length}</p>
          </div>
          <div className="bg-surface border border-portal-border rounded-xl px-5 py-4">
            <p className="text-on-canvas-muted text-xs mb-1">Quizzes Passed</p>
            <p className="text-emerald-400 text-2xl font-bold">
              {members.reduce((sum, m) => sum + m.quizzes_passed, 0)}
            </p>
          </div>
          <div className="bg-surface border border-portal-border rounded-xl px-5 py-4 col-span-2 sm:col-span-1">
            <p className="text-on-canvas-muted text-xs mb-1">Avg. Quizzes Passed</p>
            <p className="text-on-canvas text-2xl font-bold">
              {members.length > 0
                ? (members.reduce((sum, m) => sum + m.quizzes_passed, 0) / members.length).toFixed(1)
                : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
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
          <div className="p-8 text-center text-on-canvas-muted text-sm">
            {search ? 'No members match your search.' : 'No members registered yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-portal-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider hidden md:table-cell">Account Type</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-on-canvas-muted uppercase tracking-wider">Quizzes Passed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-on-canvas-muted uppercase tracking-wider hidden lg:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(member => {
                  const joined = member.created_at
                    ? new Date(member.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'
                  return (
                    <tr key={member.id} className="border-b border-portal-border/50 hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30
                                          flex items-center justify-center text-portal-accent text-xs font-bold flex-shrink-0">
                            {member.name?.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-on-canvas text-sm font-medium">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-canvas-subtle text-sm hidden sm:table-cell">{member.email}</td>
                      <td className="px-4 py-3 text-on-canvas-subtle text-sm hidden md:table-cell">
                        {TIER_LABEL[member.role] ?? member.role}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {member.quizzes_passed > 0 && (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          )}
                          <span className={`text-sm font-semibold ${member.quizzes_passed > 0 ? 'text-emerald-400' : 'text-on-canvas-muted'}`}>
                            {member.quizzes_passed}
                          </span>
                          {member.quizzes_total > 0 && (
                            <span className="text-on-canvas-muted text-xs">/ {member.quizzes_total}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-canvas-muted text-xs hidden lg:table-cell">{joined}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-on-canvas-muted text-xs">{filtered.length} of {members.length} member{members.length !== 1 ? 's' : ''}</p>
    </div>
  )
}
