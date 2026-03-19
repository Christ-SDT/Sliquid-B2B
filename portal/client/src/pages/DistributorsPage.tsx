import { useEffect, useState, FormEvent } from 'react'
import { api } from '@/api/client'
import { Distributor } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/types'
import { Search, MapPin, Phone, Mail, Globe, AlertTriangle, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'

const REGIONS = ['All', 'US', 'Canada', 'UK', 'Mexico']
const REGION_OPTIONS = ['US', 'Canada', 'UK', 'Mexico', 'US, Canada']

// ─── Distributor Form Modal ───────────────────────────────────────────────────

interface FormModalProps {
  initial?: Distributor
  onClose: () => void
  onSaved: (d: Distributor) => void
}

function DistributorFormModal({ initial, onClose, onSaved }: FormModalProps) {
  const isEdit = !!initial
  const [name, setName]               = useState(initial?.name ?? '')
  const [region, setRegion]           = useState(initial?.region ?? 'US')
  const [state, setState]             = useState(initial?.state ?? '')
  const [city, setCity]               = useState(initial?.city ?? '')
  const [address, setAddress]         = useState(initial?.address ?? '')
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [phone, setPhone]             = useState(initial?.phone ?? '')
  const [email, setEmail]             = useState(initial?.email ?? '')
  const [website, setWebsite]         = useState(initial?.website ?? '')
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const body = {
      name, region,
      state:        state || null,
      city:         city || null,
      address:      address || null,
      contact_name: contactName || null,
      phone:        phone || null,
      email:        email || null,
      website:      website || null,
      notes:        notes || null,
    }
    try {
      const saved = isEdit
        ? await api.put<Distributor>(`/distributors/${initial!.id}`, body)
        : await api.post<Distributor>('/distributors', body)
      onSaved(saved)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors'
  const labelCls = 'block text-on-canvas-subtle text-sm font-medium mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">{isEdit ? 'Edit Distributor' : 'Add Distributor'}</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Name */}
          <div>
            <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Williams Trading Co."
              required
              className={inputCls}
            />
          </div>

          {/* Region */}
          <div>
            <label className={labelCls}>Region <span className="text-red-400">*</span></label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className={inputCls}
            >
              {REGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="text-on-canvas-muted text-xs mt-1">Used for the region filter on the distributors page.</p>
          </div>

          {/* States / Display Location */}
          <div>
            <label className={labelCls}>States / Locations <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={state}
              onChange={e => setState(e.target.value)}
              placeholder="e.g. CO, MI, AZ  or  BC  or  West Sussex"
              className={inputCls}
            />
            <p className="text-on-canvas-muted text-xs mt-1">Shown on the card as the geographic coverage.</p>
          </div>

          {/* Address */}
          <div>
            <label className={labelCls}>Full Address <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 9250 Commerce Hwy, Pennsauken, NJ 08110"
              className={inputCls}
            />
          </div>

          {/* City */}
          <div>
            <label className={labelCls}>City <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Pennsauken"
              className={inputCls}
            />
          </div>

          {/* Contact */}
          <div>
            <label className={labelCls}>Contact Name / Role <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder="e.g. Sales Department  or  Kyle"
              className={inputCls}
            />
          </div>

          {/* Phone */}
          <div>
            <label className={labelCls}>Phone <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 1-800-423-8587"
              className={inputCls}
            />
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>Email <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. sales@example.com"
              className={inputCls}
            />
          </div>

          {/* Website */}
          <div>
            <label className={labelCls}>Website <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://www.example.com"
              className={inputCls}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional info — secondary contacts, shipping details, special instructions…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
            <p className="text-on-canvas-muted text-xs mt-1">Start with ⚠️ to show a warning indicator on the card.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-elevated border border-portal-border text-on-canvas-subtle
                         hover:text-on-canvas rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-portal-accent
                         hover:bg-portal-accent/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Distributor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DistributorsPage() {
  const { user } = useAuth()
  const adminUser = isAdmin(user?.role ?? '')

  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [loading, setLoading]           = useState(true)
  const [region, setRegion]             = useState('All')
  const [search, setSearch]             = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [editing, setEditing]           = useState<Distributor | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting]         = useState(false)

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

  function handleAdded(d: Distributor) {
    setDistributors(prev => [...prev, d].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function handleSaved(updated: Distributor) {
    setDistributors(prev =>
      prev.map(d => d.id === updated.id ? updated : d)
          .sort((a, b) => a.name.localeCompare(b.name))
    )
  }

  async function handleDelete(id: number) {
    setDeleting(true)
    try {
      await api.delete(`/distributors/${id}`)
      setDistributors(prev => prev.filter(d => d.id !== id))
      setConfirmDeleteId(null)
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-on-canvas text-2xl font-bold">Distributors</h1>
          <p className="text-on-canvas-muted text-sm mt-1">Find authorized Sliquid distribution partners in your area.</p>
        </div>
        {adminUser && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                       text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Distributor
          </button>
        )}
      </div>

      {/* Search + region filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, city, or state…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${region === r
                  ? 'bg-portal-accent text-white'
                  : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
                }`}
            >
              {r === 'All' ? 'All Regions' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="text-on-canvas-muted text-sm">{distributors.length} distributor{distributors.length !== 1 ? 's' : ''} found</div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-52 animate-pulse" />
          ))}
        </div>
      ) : distributors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <MapPin className="w-12 h-12 mb-3 opacity-40" />
          <p>No distributors found</p>
          {adminUser && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                         text-portal-accent rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add the first distributor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {distributors.map(d => {
            const isWarning = d.notes?.startsWith('⚠️')
            const isPendingDelete = confirmDeleteId === d.id
            return (
              <div key={d.id} className={`bg-surface border rounded-xl p-5 transition-all flex flex-col
                ${isPendingDelete ? 'border-red-500/50' : 'border-portal-border hover:border-portal-accent/30'}`}
              >
                {/* Name + region badge + admin controls */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-on-canvas font-semibold text-sm leading-snug">{d.name}</h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="px-2 py-0.5 bg-portal-accent/10 text-portal-accent rounded-full text-xs font-medium">
                      {d.region}
                    </span>
                    {adminUser && !isPendingDelete && (
                      <>
                        <button
                          onClick={() => setEditing(d)}
                          title="Edit"
                          className="p-1 text-on-canvas-muted hover:text-on-canvas rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(d.id)}
                          title="Delete"
                          className="p-1 text-on-canvas-muted hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete confirm */}
                {isPendingDelete && (
                  <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs font-medium mb-2">Delete this distributor?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(d.id)}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-red-600 hover:bg-red-700
                                   disabled:opacity-60 text-white rounded text-xs font-medium transition-colors"
                      >
                        {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 py-1.5 bg-surface-elevated border border-portal-border
                                   text-on-canvas-subtle rounded text-xs font-medium transition-colors hover:text-on-canvas"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Location */}
                {(d.state || d.address) && (
                  <div className="flex items-start gap-1.5 mb-3">
                    <MapPin className="w-3.5 h-3.5 text-on-canvas-muted flex-shrink-0 mt-0.5" />
                    <div>
                      {d.state && <span className="text-on-canvas-muted text-xs font-medium">{d.state}</span>}
                      {d.address && d.address !== d.state && (
                        <p className="text-on-canvas-muted text-xs mt-0.5">{d.address}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Contact */}
                {d.contact_name && (
                  <p className="text-on-canvas-subtle text-xs mb-3">
                    Contact: <span className="text-on-canvas">{d.contact_name}</span>
                  </p>
                )}

                {/* Phone / Email / Website */}
                <div className="space-y-1.5 mb-3 flex-1">
                  {d.phone && (
                    <a href={`tel:${d.phone}`} className="flex items-center gap-2 text-on-canvas-subtle hover:text-on-canvas text-xs transition-colors">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      {d.phone}
                    </a>
                  )}
                  {d.email && (
                    <a href={`mailto:${d.email}`} className="flex items-center gap-2 text-on-canvas-subtle hover:text-on-canvas text-xs transition-colors">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      {d.email}
                    </a>
                  )}
                  {d.website && (
                    <a href={d.website} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-on-canvas-subtle hover:text-portal-accent text-xs transition-colors">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                      {d.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>

                {/* Notes */}
                {d.notes && (
                  <div className={`mt-auto pt-3 border-t border-portal-border/60 flex items-start gap-1.5
                    ${isWarning ? 'text-amber-400' : 'text-on-canvas-muted'}`}>
                    {isWarning && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                    <p className="text-xs leading-relaxed">{d.notes}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <DistributorFormModal
          onClose={() => setShowAdd(false)}
          onSaved={handleAdded}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <DistributorFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => { handleSaved(updated); setEditing(null) }}
        />
      )}
    </div>
  )
}
