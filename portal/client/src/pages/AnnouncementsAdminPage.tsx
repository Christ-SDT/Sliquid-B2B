import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  RefreshCw, Plus, X, Loader2, Pin, Trash2, Pencil, ExternalLink,
  Megaphone, AlertCircle, Globe, Building2,
} from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin, type Announcement, type AnnouncementSyncStatus } from '@/types'
import {
  formatDateTime, timeUntil, timeAgo, toLocalInputValue, fromLocalInputValue, cn,
} from '@/lib/utils'
import AnnouncementBody from '@/components/AnnouncementBody'

const inputCls = 'w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors'
const labelCls = 'block text-on-canvas-subtle text-sm font-medium mb-1.5'

type Filter = 'all' | 'review' | 'scheduled' | 'live' | 'portal'

const STATUS_STYLES: Record<string, string> = {
  live: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  scheduled: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  hidden: 'bg-slate-500/15 text-on-canvas-muted border-portal-border',
  archived: 'bg-slate-500/15 text-on-canvas-muted border-portal-border',
  expired: 'bg-red-500/15 text-red-400 border-red-500/30',
}

// ─── Switch ───────────────────────────────────────────────────────────────────

function Switch({ on, onClick, label, busy }: {
  on: boolean; onClick: () => void; label: string; busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50',
        on ? 'bg-portal-accent' : 'bg-portal-border',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
          on ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

function AnnouncementFormModal({ initial, onClose, onSaved }: {
  initial: Announcement | null
  onClose: () => void
  onSaved: (a: Announcement) => void
}) {
  const isEdit = !!initial
  const isPortalRow = initial?.source === 'portal' || !isEdit

  const [title, setTitle] = useState(initial?.source === 'portal' ? (initial.title ?? '') : '')
  const [titleOverride, setTitleOverride] = useState(initial?.title_override ?? '')
  const [excerptOverride, setExcerptOverride] = useState(initial?.excerpt_override ?? '')
  const [imageOverride, setImageOverride] = useState(initial?.image_url_override ?? '')
  const [bodyOverride, setBodyOverride] = useState(initial?.body_html_override ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'hidden')
  const [publishAt, setPublishAt] = useState(toLocalInputValue(initial?.publish_at))
  const [expiresAt, setExpiresAt] = useState(toLocalInputValue(initial?.expires_at))
  const [showPortal, setShowPortal] = useState((initial?.show_in_portal ?? 0) === 1)
  const [showPublic, setShowPublic] = useState((initial?.show_on_public ?? 0) === 1)
  const [pinned, setPinned] = useState((initial?.pinned ?? 0) === 1)
  const [adminNotes, setAdminNotes] = useState(initial?.admin_notes ?? '')
  const [showPreview, setShowPreview] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const body: Record<string, unknown> = {
      title_override: titleOverride.trim(),
      excerpt_override: excerptOverride.trim(),
      image_url_override: imageOverride.trim(),
      body_html_override: bodyOverride.trim(),
      status,
      publish_at: fromLocalInputValue(publishAt),
      expires_at: fromLocalInputValue(expiresAt),
      show_in_portal: showPortal ? 1 : 0,
      show_on_public: showPublic ? 1 : 0,
      pinned: pinned ? 1 : 0,
      admin_notes: adminNotes.trim(),
    }
    if (isPortalRow) body.title = title.trim()

    try {
      const saved = isEdit
        ? await api.put<Announcement>(`/announcements/${initial!.id}`, body)
        : await api.post<Announcement>('/announcements', body)
      onSaved(saved)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-2xl
                      max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border
                        sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">
            {isEdit ? 'Edit announcement' : 'New announcement'}
          </h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {isEdit && initial!.source === 'wordpress' && (
            <div className="px-4 py-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm">
              Synced from WordPress. The article body is managed there and refreshed on
              every sync — the fields below are portal-only overrides.
            </div>
          )}

          {isPortalRow ? (
            <div>
              <label className={labelCls}>Title <span className="text-red-400">*</span></label>
              <input className={inputCls} value={title} required
                     onChange={e => setTitle(e.target.value)} placeholder="Announcement title" />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Title override</label>
              <input className={inputCls} value={titleOverride}
                     onChange={e => setTitleOverride(e.target.value)}
                     placeholder={initial?.wp_title ?? 'Leave blank to use the WordPress title'} />
              <p className="text-on-canvas-muted text-xs mt-1">
                Blank uses the WordPress title.
              </p>
            </div>
          )}

          <div>
            <label className={labelCls}>{isPortalRow ? 'Summary' : 'Excerpt override'}</label>
            <textarea className={cn(inputCls, 'min-h-[70px] resize-y')} value={excerptOverride}
                      onChange={e => setExcerptOverride(e.target.value)}
                      placeholder={isPortalRow ? 'Short summary shown on cards' : 'Leave blank to use the WordPress excerpt'} />
          </div>

          <div>
            <label className={labelCls}>Image URL {isPortalRow ? '' : 'override'}</label>
            <input className={inputCls} value={imageOverride}
                   onChange={e => setImageOverride(e.target.value)}
                   placeholder="https://sliquid.com/wp-content/uploads/…" />
          </div>

          {isPortalRow && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={cn(labelCls, 'mb-0')}>Body HTML</label>
                <button type="button" onClick={() => setShowPreview(p => !p)}
                        className="text-portal-accent text-xs font-medium hover:opacity-80">
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
              <textarea className={cn(inputCls, 'min-h-[140px] resize-y font-mono text-xs')}
                        value={bodyOverride} onChange={e => setBodyOverride(e.target.value)}
                        placeholder="<p>Announcement body…</p>" />
              {showPreview && bodyOverride.trim() && (
                <div className="mt-3 rounded-lg border border-portal-border p-4 bg-portal-bg">
                  <p className="text-on-canvas-muted text-xs mb-2">Preview</p>
                  <AnnouncementBody html={bodyOverride} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={status}
                      onChange={e => setStatus(e.target.value as NonNullable<Announcement['status']>)}>
                <option value="hidden">Hidden</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Go live at</label>
              <input type="datetime-local" className={inputCls} value={publishAt}
                     onChange={e => setPublishAt(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Expires at</label>
              <input type="datetime-local" className={inputCls} value={expiresAt}
                     onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <p className="text-on-canvas-muted text-xs -mt-2">
            Set status to <strong>Published</strong> with a future “go live at” to schedule it.
            Leave “go live at” blank to publish immediately. Times are in your local timezone.
          </p>

          <div className="space-y-2 pt-2 border-t border-portal-border">
            <label className={labelCls}>Visibility</label>
            <div className="flex items-center gap-3">
              <Switch on={showPortal} onClick={() => setShowPortal(v => !v)} label="Show in portal" />
              <span className="text-on-canvas text-sm">Show in portal</span>
              <span className="text-on-canvas-muted text-xs">(logged-in partners)</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch on={showPublic} onClick={() => setShowPublic(v => !v)} label="Show on public site" />
              <span className="text-on-canvas text-sm">Show on public B2B site</span>
              <span className="text-on-canvas-muted text-xs">(anyone)</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch on={pinned} onClick={() => setPinned(v => !v)} label="Pin to top" />
              <span className="text-on-canvas text-sm">Pin to top</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Admin notes</label>
            <input className={inputCls} value={adminNotes}
                   onChange={e => setAdminNotes(e.target.value)}
                   placeholder="Internal only — never shown to partners" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-portal-border
                               text-on-canvas-subtle text-sm hover:bg-surface-elevated transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-portal-accent hover:bg-portal-accent/90
                               text-white text-sm font-medium transition-colors disabled:opacity-60
                               flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ a, onPatch, onEdit, onRemoved }: {
  a: Announcement
  onPatch: (patch: Partial<Announcement>) => void
  onEdit: () => void
  onRemoved: (archived: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isWp = a.source === 'wordpress'

  async function toggle(kind: 'portal-visibility' | 'public-visibility' | 'pinned') {
    setBusy(true)
    try {
      const r = await api.put<Record<string, number>>(`/announcements/${a.id}/${kind}`, {})
      onPatch(r as Partial<Announcement>)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const r = await api.delete<{ ok: boolean; archived?: boolean }>(`/announcements/${a.id}`)
      onRemoved(!!r.archived)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  const effective = a.effective_status ?? a.status ?? 'hidden'
  const scheduled = effective === 'scheduled'

  return (
    <tr className={cn('border-b border-portal-border/60 last:border-0',
      confirming && 'bg-red-500/5')}>
      <td className="px-4 py-3 align-top">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold',
          isWp ? 'bg-sky-500/15 text-sky-400' : 'bg-violet-500/15 text-violet-400')}>
          {isWp ? 'WP' : 'Portal'}
        </span>
      </td>

      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-2">
          <span className="text-on-canvas text-sm font-medium leading-snug">{a.title}</span>
          {a.title_override && (
            <span title={`WordPress original: ${a.wp_title ?? ''}`}
                  className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                  aria-label="Title overridden" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn('inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase',
            STATUS_STYLES[effective] ?? STATUS_STYLES.hidden)}>
            {effective}
          </span>
          {a.wp_link && (
            <a href={a.wp_link} target="_blank" rel="noopener noreferrer"
               className="text-on-canvas-muted hover:text-portal-accent text-[11px] inline-flex items-center gap-1">
              sliquid.com <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </td>

      <td className="px-4 py-3 align-top text-xs">
        <div className="text-on-canvas-subtle">{formatDateTime(a.published_at)}</div>
        {scheduled && a.publish_at && (
          <div className="text-amber-400 font-medium mt-0.5">
            Goes live {timeUntil(a.publish_at)}
          </div>
        )}
        {a.last_synced_at && (
          <div className="text-on-canvas-muted mt-0.5">synced {timeAgo(a.last_synced_at)}</div>
        )}
      </td>

      <td className="px-3 py-3 align-top text-center">
        <Switch on={a.show_in_portal === 1} busy={busy}
                onClick={() => toggle('portal-visibility')} label="Show in portal" />
      </td>
      <td className="px-3 py-3 align-top text-center">
        <Switch on={a.show_on_public === 1} busy={busy}
                onClick={() => toggle('public-visibility')} label="Show on public site" />
      </td>
      <td className="px-3 py-3 align-top text-center">
        <button onClick={() => toggle('pinned')} disabled={busy} aria-label="Pin"
                className={cn('p-1.5 rounded transition-colors',
                  a.pinned === 1 ? 'text-portal-accent' : 'text-on-canvas-muted hover:text-on-canvas')}>
          <Pin className={cn('w-4 h-4', a.pinned === 1 && 'fill-current')} />
        </button>
      </td>

      <td className="px-4 py-3 align-top">
        {confirming ? (
          <div className="flex items-center gap-2">
            <button onClick={remove} disabled={busy}
                    className="px-2 py-1 rounded bg-red-500/15 text-red-400 text-xs font-medium
                               hover:bg-red-500/25 transition-colors disabled:opacity-60">
              {busy ? '…' : isWp ? 'Archive' : 'Delete'}
            </button>
            <button onClick={() => setConfirming(false)}
                    className="text-on-canvas-muted text-xs hover:text-on-canvas">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} aria-label="Edit"
                    className="p-1.5 rounded text-on-canvas-muted hover:text-portal-accent transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setConfirming(true)}
                    aria-label={isWp ? 'Archive' : 'Delete'}
                    title={isWp
                      ? 'Archive — hides it everywhere. WordPress rows cannot be deleted, the next sync would just restore them.'
                      : 'Delete permanently'}
                    className="p-1.5 rounded text-on-canvas-muted hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementsAdminPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<Announcement[]>([])
  const [status, setStatus] = useState<AnnouncementSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Announcement | null>(null)

  // Route-level access is enforced by Shell's allow-lists, but guard the page
  // itself too — that enforcement is negative-space and easy to break.
  if (!isAdmin(user?.role ?? '')) return <Navigate to="/dashboard" replace />

  function load() {
    return Promise.all([
      api.get<Announcement[]>('/announcements/admin'),
      api.get<AnnouncementSyncStatus>('/announcements/admin/sync/status').catch(() => null),
    ])
      .then(([rows, st]) => { setItems(rows); setStatus(st) })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Never sync from an effect — StrictMode double-invokes effects in dev and
  // this would fire two concurrent pulls.
  async function runSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await api.post<{
        status: string; posts_created: number; posts_updated: number
        posts_skipped: number; message?: string
      }>('/announcements/admin/sync', {})
      setSyncMsg(r.status === 'ok'
        ? `${r.posts_created} new, ${r.posts_updated} updated, ${r.posts_skipped} skipped`
        : `Sync failed: ${r.message ?? 'unknown error'}`)
      await load()
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const visible = items.filter(a => {
    const eff = a.effective_status ?? a.status
    if (filter === 'review') return eff === 'hidden' && !a.notified_at
    if (filter === 'scheduled') return eff === 'scheduled'
    if (filter === 'live') return eff === 'live'
    if (filter === 'portal') return a.source === 'portal'
    return true
  })

  const counts = status?.counts

  return (
    <div className="p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-on-canvas text-2xl font-semibold">Manage Announcements</h1>
          <p className="text-on-canvas-subtle text-sm mt-1">
            Press releases synced from WordPress, plus portal-only announcements.
            New items arrive hidden until you publish them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runSync} disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-portal-border
                             text-on-canvas-subtle text-sm hover:bg-surface-elevated transition-colors
                             disabled:opacity-60">
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button onClick={() => { setEditTarget(null); setShowForm(true) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-portal-accent
                             hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </header>

      {syncMsg && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-portal-accent/10 border border-portal-accent/30
                        text-portal-accent text-sm">
          {syncMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {status && (
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-on-canvas-muted">
          <span className="inline-flex items-center gap-1.5">
            <Globe className="w-3 h-3" /> {status.config.baseUrl}
          </span>
          <span>category {status.config.categoryId}</span>
          <span>cutoff {status.config.cutoffDate}</span>
          {status.lastSync && (
            <span className={status.lastSync.status === 'error' ? 'text-red-400' : ''}>
              last sync {timeAgo(status.lastSync.synced_at)}
              {status.lastSync.status === 'error' && ' — failed'}
            </span>
          )}
          {!status.enabled && (
            <span className="text-amber-400 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> scheduled sync disabled
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {([
          ['all', `All${counts ? ` (${counts.total})` : ''}`],
          ['review', `Needs review${counts ? ` (${counts.hidden})` : ''}`],
          ['scheduled', `Scheduled${counts ? ` (${counts.scheduled})` : ''}`],
          ['live', `Live${counts ? ` (${counts.live})` : ''}`],
          ['portal', `Portal-only${counts ? ` (${counts.portal_only})` : ''}`],
        ] as [Filter, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
                  className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    filter === key
                      ? 'bg-portal-accent text-white border-portal-accent'
                      : 'bg-surface text-on-canvas-subtle border-portal-border hover:border-on-canvas-muted')}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-lg h-16 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <Megaphone className="w-12 h-12 mb-3 opacity-40" />
          <p>No announcements {filter !== 'all' ? 'in this view' : 'yet'}</p>
          {filter === 'all' && (
            <button onClick={runSync}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-portal-accent/10
                               hover:bg-portal-accent/20 text-portal-accent rounded-lg text-sm font-medium">
              <RefreshCw className="w-4 h-4" /> Sync from WordPress
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-portal-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-portal-border text-on-canvas-muted text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Date / schedule</th>
                <th className="px-3 py-3 font-semibold text-center">
                  <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />Portal</span>
                </th>
                <th className="px-3 py-3 font-semibold text-center">
                  <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" />Public</span>
                </th>
                <th className="px-3 py-3 font-semibold text-center">Pin</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(a => (
                <Row
                  key={a.id}
                  a={a}
                  onPatch={patch => setItems(prev =>
                    prev.map(x => x.id === a.id ? { ...x, ...patch } : x))}
                  onEdit={() => { setEditTarget(a); setShowForm(true) }}
                  onRemoved={archived => {
                    if (archived) load()
                    else setItems(prev => prev.filter(x => x.id !== a.id))
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AnnouncementFormModal
          initial={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={saved => {
            setItems(prev => prev.some(x => x.id === saved.id)
              ? prev.map(x => x.id === saved.id ? saved : x)
              : [saved, ...prev])
            load()
          }}
        />
      )}
    </div>
  )
}
