import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/api/client'
import {
  Bot, ShieldCheck, ShieldOff, Search, Loader2, AlertCircle, AlertTriangle,
  Clock, Ban, PackageSearch, Fingerprint, KeyRound, EyeOff, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Packshot approval queue.
 *
 * This panel is the human gate in front of an external system. A row with
 * `approved = 1 AND packshot_status = 'active'` is served by the MCP server to
 * the Sliquid Brand Agent in ChatGPT — anyone talking to that agent can pull the
 * image. That is why the approval control here is not a checkbox labelled
 * "approved": every piece of copy names the consequence.
 *
 * The disabled reasons below mirror the server guard in
 * `routes/media.ts → PUT /media/packshots/:id/approved` exactly. The server is
 * the authority; this is only so an admin is never surprised by a 400.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackshotStatus = 'active' | 'discontinued' | 'pending_approval'

export interface Packshot {
  id: number
  label: string | null
  filename: string
  brand: string | null
  file_url: string
  thumbnail_url: string | null
  file_size: string | null
  dimensions: string | null
  mime_type: string | null
  created_at: string
  sku: string | null
  unit_size: string | null
  package_version: string | null
  packshot_status: PackshotStatus
  approved: number
  sha256: string | null
  asset_key: string | null
  product_name: string | null
  product_category: string | null
  product_brand: string | null
  product_upc: string | null
}

interface PackshotCounts {
  total: number
  live: number
  awaiting: number
  discontinued: number
  approved_not_active: number
}

interface PackshotResponse {
  items: Packshot[]
  count: number
  counts: PackshotCounts
}

interface ToggleResponse {
  item: Packshot
  counts: PackshotCounts
}

const EMPTY_COUNTS: PackshotCounts = {
  total: 0, live: 0, awaiting: 0, discontinued: 0, approved_not_active: 0,
}

// ─── Filters ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'all',              label: 'All statuses' },
  { value: 'active',           label: 'Active' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'discontinued',     label: 'Discontinued' },
] as const

const APPROVAL_FILTERS = [
  { value: 'all',   label: 'All' },
  { value: 'true',  label: 'Live to agent' },
  { value: 'false', label: 'Not published' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(p: Packshot): string {
  return p.product_name || p.label || p.filename
}

function statusChipClass(status: PackshotStatus): string {
  switch (status) {
    case 'active':           return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/40'
    case 'pending_approval': return 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40'
    case 'discontinued':     return 'bg-surface-elevated text-on-canvas-muted border-portal-border'
  }
}

function statusLabel(status: PackshotStatus): string {
  switch (status) {
    case 'active':           return 'Active'
    case 'pending_approval': return 'Pending approval'
    case 'discontinued':     return 'Discontinued'
  }
}

/**
 * Why this row cannot be published to the agent — or null if it can.
 * Mirrors the server guard. Un-approving is never blocked.
 */
function blockedReason(p: Packshot): string | null {
  if (p.packshot_status === 'discontinued') {
    return 'Discontinued packshots can never be published — the agent must not show a bottle that is no longer on shelf.'
  }
  if (p.packshot_status === 'pending_approval') {
    return 'This packshot is still marked pending_approval in the catalog. Only rows the import marked active can be published.'
  }
  if (!p.sha256) {
    return 'No sha256 on this row — the file contents are unverifiable, so it cannot be published. Re-run the import to hash it.'
  }
  if (!p.asset_key) {
    return 'No asset_key on this row — the agent would have no stable way to address it. Re-run the import to assign one.'
  }
  return null
}

// ─── Summary header ───────────────────────────────────────────────────────────

function SummaryTile({
  icon: Icon, value, title, subtitle, tone,
}: {
  icon: typeof Bot
  value: number
  title: string
  subtitle: string
  tone: 'live' | 'awaiting' | 'muted'
}) {
  const toneCls =
    tone === 'live'     ? 'border-emerald-500/40 bg-emerald-500/5'
    : tone === 'awaiting' ? 'border-amber-500/40 bg-amber-500/5'
    : 'border-portal-border bg-surface-elevated'
  const iconCls =
    tone === 'live'     ? 'text-emerald-500'
    : tone === 'awaiting' ? 'text-amber-500'
    : 'text-on-canvas-muted'

  return (
    <div className={cn('rounded-xl border p-4', toneCls)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4 flex-shrink-0', iconCls)} />
        <span className="text-2xl font-bold text-on-canvas leading-none">{value}</span>
      </div>
      <p className="text-on-canvas text-sm font-medium">{title}</p>
      <p className="text-on-canvas-muted text-xs mt-0.5">{subtitle}</p>
    </div>
  )
}

// ─── Approval control ─────────────────────────────────────────────────────────

function ApprovalControl({
  packshot, busy, onToggle,
}: {
  packshot: Packshot
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  const approved = packshot.approved === 1
  const blocked = blockedReason(packshot)

  // Approved but no longer active: the MCP list feed drops it, yet a direct
  // asset_key lookup still resolves. Surface it rather than let it sit silently.
  if (approved && packshot.packshot_status !== 'active') {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
        <p className="text-amber-600 dark:text-amber-300 text-xs font-medium flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Still approved but no longer active — revoke it.
        </p>
        <button
          onClick={() => onToggle(false)}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-surface-elevated border border-portal-border text-on-canvas hover:border-red-500/50 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
          Revoke agent access
        </button>
      </div>
    )
  }

  if (approved) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 space-y-2">
        <p className="text-emerald-600 dark:text-emerald-300 text-xs font-semibold flex items-start gap-1.5">
          <Bot className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Live to the ChatGPT Brand Agent
        </p>
        <p className="text-on-canvas-muted text-[11px] leading-snug">
          Anyone chatting with the Sliquid Brand Agent can retrieve this image right now.
        </p>
        <button
          onClick={() => onToggle(false)}
          disabled={busy}
          title="Removes this image from the agent immediately"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-surface-elevated border border-portal-border text-on-canvas hover:border-red-500/50 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
          Revoke agent access
        </button>
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="rounded-lg border border-portal-border bg-surface-elevated p-2.5 space-y-2">
        <p className="text-on-canvas-muted text-xs font-medium flex items-start gap-1.5">
          <Ban className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Cannot be published
        </p>
        <button
          disabled
          title={blocked}
          aria-label={blocked}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-portal-bg border border-portal-border text-on-canvas-muted cursor-not-allowed opacity-70"
        >
          <Ban className="w-3.5 h-3.5" />
          Approval unavailable
        </button>
        <p className="text-on-canvas-muted text-[11px] leading-snug">{blocked}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-portal-border bg-portal-bg p-2.5 space-y-2">
      <p className="text-on-canvas-muted text-xs font-medium flex items-start gap-1.5">
        <EyeOff className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        Not visible to the agent
      </p>
      <button
        onClick={() => onToggle(true)}
        disabled={busy}
        title="Publishes this image to the Sliquid Brand Agent in ChatGPT"
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-portal-accent text-white hover:bg-portal-accent/90 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        Publish to ChatGPT agent
      </button>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PackshotCard({
  packshot, busy, onToggle,
}: {
  packshot: Packshot
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  const approved = packshot.approved === 1
  const live = approved && packshot.packshot_status === 'active'

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface overflow-hidden flex flex-col transition-colors',
        live ? 'border-emerald-500/50' : 'border-portal-border',
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-portal-bg flex items-center justify-center">
        <img
          src={packshot.thumbnail_url || packshot.file_url}
          alt={displayName(packshot)}
          loading="lazy"
          className="w-full h-full object-contain p-2"
          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
        />
        <span
          className={cn(
            'absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none',
            statusChipClass(packshot.packshot_status),
          )}
        >
          {statusLabel(packshot.packshot_status)}
        </span>
        {live && (
          <span className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold leading-none bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40">
            <Bot className="w-3 h-3" />
            Live
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div>
          <p className="text-on-canvas text-sm font-semibold leading-tight line-clamp-2" title={displayName(packshot)}>
            {displayName(packshot)}
          </p>
          {packshot.product_category && (
            <p className="text-on-canvas-muted text-[11px] mt-0.5">{packshot.product_category}</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="bg-portal-bg border border-portal-border rounded-md px-2 py-1">
            <dt className="text-on-canvas-muted uppercase tracking-wide text-[9px]">SKU</dt>
            <dd className="text-on-canvas font-mono truncate" title={packshot.sku ?? ''}>
              {packshot.sku || <span className="text-on-canvas-muted italic font-sans">none</span>}
            </dd>
          </div>
          <div className="bg-portal-bg border border-portal-border rounded-md px-2 py-1">
            <dt className="text-on-canvas-muted uppercase tracking-wide text-[9px]">Size</dt>
            <dd className="text-on-canvas truncate">
              {packshot.unit_size || <span className="text-on-canvas-muted italic">unknown</span>}
            </dd>
          </div>
          <div className="bg-portal-bg border border-portal-border rounded-md px-2 py-1 col-span-2">
            <dt className="text-on-canvas-muted uppercase tracking-wide text-[9px]">Package version</dt>
            <dd className="text-on-canvas truncate">
              {packshot.package_version || <span className="text-on-canvas-muted italic">unspecified</span>}
            </dd>
          </div>
        </dl>

        {/* Integrity markers — what the server guard checks */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span
            title={packshot.asset_key ? `asset_key: ${packshot.asset_key}` : 'No asset_key — cannot be addressed by the agent'}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-mono',
              packshot.asset_key
                ? 'bg-surface-elevated border-portal-border text-on-canvas-subtle'
                : 'bg-red-500/10 border-red-500/40 text-red-500',
            )}
          >
            <KeyRound className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate max-w-[9rem]">{packshot.asset_key ?? 'no asset_key'}</span>
          </span>
          <span
            title={packshot.sha256 ? `sha256: ${packshot.sha256}` : 'No sha256 — file contents unverifiable'}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-mono',
              packshot.sha256
                ? 'bg-surface-elevated border-portal-border text-on-canvas-subtle'
                : 'bg-red-500/10 border-red-500/40 text-red-500',
            )}
          >
            <Fingerprint className="w-2.5 h-2.5 flex-shrink-0" />
            {packshot.sha256 ? packshot.sha256.slice(0, 10) : 'no sha256'}
          </span>
        </div>

        <div className="mt-auto pt-1">
          <ApprovalControl packshot={packshot} busy={busy} onToggle={onToggle} />
        </div>
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function PackshotApprovalPanel() {
  const [items, setItems] = useState<Packshot[]>([])
  const [counts, setCounts] = useState<PackshotCounts>(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyIds, setBusyIds] = useState<number[]>([])

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [approvalFilter, setApprovalFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const qs = new URLSearchParams()
    if (statusFilter !== 'all') qs.set('status', statusFilter)
    if (approvalFilter !== 'all') qs.set('approved', approvalFilter)
    if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
    const s = qs.toString()
    return s ? `?${s}` : ''
  }, [statusFilter, approvalFilter, debouncedSearch])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.get<PackshotResponse>(`/media/packshots${query}`)
      .then(data => {
        setItems(data.items ?? [])
        setCounts(data.counts ?? EMPTY_COUNTS)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load packshots')
        setLoading(false)
      })
  }, [query])

  useEffect(() => { load() }, [load])

  async function toggleApproval(packshot: Packshot, next: boolean) {
    setActionError('')
    setBusyIds(prev => [...prev, packshot.id])

    const previous = packshot
    // Optimistic: flip the row and nudge the summary so the header agrees with
    // the card. Both are overwritten by the server's authoritative response.
    setItems(prev => prev.map(i => i.id === packshot.id ? { ...i, approved: next ? 1 : 0 } : i))
    setCounts(prev => ({
      ...prev,
      live:     Math.max(0, prev.live + (next ? 1 : -1)),
      awaiting: Math.max(0, prev.awaiting + (next ? -1 : 1)),
    }))

    try {
      const res = await api.put<ToggleResponse>(
        `/media/packshots/${packshot.id}/approved`,
        { approved: next },
      )
      setItems(prev => prev.map(i => i.id === packshot.id ? res.item : i))
      setCounts(res.counts ?? EMPTY_COUNTS)
    } catch (err: any) {
      // Revert — the row was never published, so the UI must not imply it was.
      setItems(prev => prev.map(i => i.id === previous.id ? previous : i))
      setCounts(prev => ({
        ...prev,
        live:     Math.max(0, prev.live + (next ? -1 : 1)),
        awaiting: Math.max(0, prev.awaiting + (next ? 1 : -1)),
      }))
      setActionError(`${displayName(previous)}: ${err.message ?? 'Update failed'}`)
    } finally {
      setBusyIds(prev => prev.filter(id => id !== packshot.id))
    }
  }

  const filtersActive = statusFilter !== 'all' || approvalFilter !== 'all' || !!debouncedSearch.trim()

  return (
    <div className="space-y-5">

      {/* Stakes banner */}
      <div className="rounded-xl border border-portal-accent/40 bg-portal-accent/5 p-4 flex items-start gap-3">
        <Bot className="w-5 h-5 text-portal-accent flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-on-canvas text-sm font-semibold">
            Approving a packshot publishes it to the Sliquid Brand Agent in ChatGPT
          </p>
          <p className="text-on-canvas-subtle text-xs leading-relaxed">
            Every approved, active packshot is served to an external AI agent that anyone can talk to.
            Only approve images you are willing to see used in public conversations. Revoking access
            takes effect immediately — the agent can no longer retrieve the image, even by its asset key.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile
          icon={Bot}
          value={counts.live}
          title="Live to the agent"
          subtitle="Approved and active — retrievable in ChatGPT right now"
          tone="live"
        />
        <SummaryTile
          icon={Clock}
          value={counts.awaiting}
          title="Awaiting approval"
          subtitle="Imported but invisible to the agent"
          tone="awaiting"
        />
        <SummaryTile
          icon={Ban}
          value={counts.discontinued}
          title="Discontinued"
          subtitle="Never publishable — off shelf"
          tone="muted"
        />
      </div>

      {counts.approved_not_active > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-on-canvas text-xs leading-relaxed">
            <span className="font-semibold">
              {counts.approved_not_active} approved packshot{counts.approved_not_active === 1 ? ' is' : 's are'} no longer active.
            </span>{' '}
            They have dropped out of the agent's search results, but an exact asset-key lookup can still
            resolve them. Revoke approval to remove them completely.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-portal-border rounded-xl p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by product name, SKU, filename or asset key…"
            className="w-full bg-portal-bg border border-portal-border rounded-lg pl-9 pr-3 py-2 text-sm text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-on-canvas-muted text-xs whitespace-nowrap">Status:</span>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                statusFilter === f.value
                  ? 'bg-portal-accent border-portal-accent text-white'
                  : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-on-canvas-muted text-xs whitespace-nowrap">Agent visibility:</span>
          {APPROVAL_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setApprovalFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                approvalFilter === f.value
                  ? 'bg-portal-accent border-portal-accent text-white'
                  : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas',
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={load}
            title="Reload packshots"
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-portal-border bg-surface-elevated text-on-canvas-subtle hover:text-on-canvas transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError('')} className="text-xs underline hover:no-underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-portal-accent" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-portal-border rounded-xl bg-surface">
          <PackageSearch className="w-10 h-10 text-on-canvas-muted mx-auto mb-3 opacity-50" />
          {counts.total === 0 ? (
            <>
              <p className="text-on-canvas text-sm font-medium">No packshots have been imported yet</p>
              <p className="text-on-canvas-muted text-xs mt-2 max-w-md mx-auto leading-relaxed">
                Build and load the catalog with the packshot import scripts in{' '}
                <code className="font-mono bg-portal-bg border border-portal-border rounded px-1.5 py-0.5">
                  portal/server/scripts/packshot-data/
                </code>
                . Every imported row lands unapproved, so nothing reaches the ChatGPT agent until
                someone approves it here.
              </p>
            </>
          ) : (
            <>
              <p className="text-on-canvas text-sm font-medium">No packshots match these filters</p>
              {filtersActive && (
                <button
                  onClick={() => { setStatusFilter('all'); setApprovalFilter('all'); setSearch('') }}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium border border-portal-border bg-surface-elevated text-on-canvas-subtle hover:text-on-canvas transition-colors"
                >
                  Clear filters
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-on-canvas-muted text-xs">
            Showing {items.length} of {counts.total} packshot{counts.total === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map(p => (
              <PackshotCard
                key={p.id}
                packshot={p}
                busy={busyIds.includes(p.id)}
                onToggle={next => toggleApproval(p, next)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
