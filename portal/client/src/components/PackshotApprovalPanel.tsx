import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/api/client'
import {
  Bot, ShieldCheck, ShieldOff, Search, Loader2, AlertCircle, AlertTriangle,
  Clock, Ban, PackageSearch, Fingerprint, KeyRound, EyeOff, RefreshCw,
  Star, ImageOff, Unlink, ListChecks,
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
  is_primary: number
  status_set_by: string | null
  status_set_at: string | null
}

/** A product row from the coverage report — a product, not a packshot. */
export interface UncoveredProduct {
  id: number
  sku: string
  name: string
  brand: string | null
  category: string | null
  unit_size: string | null
  /** How many packshots exist for this SKU at all, published or not. */
  packshot_count: number
}

interface PackshotCounts {
  total: number
  live: number
  awaiting: number
  discontinued: number
  approved_not_active: number
  primary_set: number
  orphaned: number
}

interface CoverageResponse {
  missing: UncoveredProduct[]
  orphaned: Packshot[]
  discontinued: Packshot[]
  counts: PackshotCounts & {
    products_total: number
    products_missing: number
    orphaned: number
    discontinued_listed: number
  }
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
  primary_set: 0, orphaned: 0,
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
    return 'Discontinued packshots cannot be published — the agent must not show a bottle that is no longer on shelf. Set the status back to Active if this product is being sold again.'
  }
  if (p.packshot_status === 'pending_approval') {
    return 'Still marked pending approval, which means the import could not confirm which product this is. Confirm the identity, then set the status to Active.'
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

// ─── Primary + status controls ────────────────────────────────────────────────

/**
 * The "main image" switch. Marking a packshot primary is what makes it the image
 * the product catalog and the marketing site show — before this existed, those
 * surfaces read `products.image_url`, which only the CSV import ever wrote, so a
 * packshot approved here was invisible everywhere else.
 *
 * Requires a SKU: a primary image is the primary image OF a product, and the
 * server refuses an unmatched row for the same reason.
 */
function PrimaryControl({
  packshot, busy, onSetPrimary,
}: {
  packshot: Packshot
  busy: boolean
  onSetPrimary: (next: boolean) => void
}) {
  const isPrimary = packshot.is_primary === 1
  const noSku = !packshot.sku
  const unpublished = packshot.approved !== 1

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSetPrimary(!isPrimary)}
        disabled={busy || noSku}
        title={
          noSku
            ? 'No SKU on this row — match it to a product before it can be a main image'
            : isPrimary
              ? 'Stop using this as the main image for this SKU'
              : 'Use this as the main image for this SKU everywhere in the portal'
        }
        className={cn(
          'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          isPrimary
            ? 'bg-portal-accent/15 border-portal-accent/50 text-portal-accent'
            : 'bg-surface-elevated border-portal-border text-on-canvas hover:border-portal-accent/50',
        )}
      >
        {busy
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Star className={cn('w-3.5 h-3.5', isPrimary && 'fill-current')} />}
        {isPrimary ? 'Main image for this SKU' : 'Set as main image'}
      </button>
      {isPrimary && unpublished && (
        <p className="text-amber-600 dark:text-amber-300 text-[11px] leading-snug flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
          Main image, but not published — the catalog shows nothing until this is approved.
        </p>
      )}
    </div>
  )
}

/**
 * Status editor. Until this existed the ONLY writer of `packshot_status` was the
 * import script, sourcing it from a hardcoded regex list — so discontinuing a
 * product meant editing that script and re-importing the whole catalog.
 */
function StatusControl({
  packshot, busy, onSetStatus,
}: {
  packshot: Packshot
  busy: boolean
  onSetStatus: (next: PackshotStatus) => void
}) {
  return (
    <label className="block">
      <span className="text-on-canvas-muted uppercase tracking-wide text-[9px]">Product status</span>
      <select
        value={packshot.packshot_status}
        disabled={busy}
        onChange={e => onSetStatus(e.target.value as PackshotStatus)}
        className="mt-0.5 w-full bg-portal-bg border border-portal-border rounded-md px-2 py-1.5 text-xs text-on-canvas focus:outline-none focus:border-portal-accent disabled:opacity-50"
      >
        <option value="active">Active</option>
        <option value="pending_approval">Pending approval</option>
        <option value="discontinued">Discontinued</option>
      </select>
      {packshot.status_set_by && (
        <span className="block text-on-canvas-muted text-[10px] mt-0.5 truncate" title={`${packshot.status_set_by} · ${packshot.status_set_at ?? ''}`}>
          set by {packshot.status_set_by}
        </span>
      )}
    </label>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PackshotCard({
  packshot, busy, onToggle, onSetStatus, onSetPrimary,
}: {
  packshot: Packshot
  busy: boolean
  onToggle: (next: boolean) => void
  onSetStatus: (next: PackshotStatus) => void
  onSetPrimary: (next: boolean) => void
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
        {packshot.is_primary === 1 && (
          <span
            title="Main image for this SKU — shown in the product catalog and on the marketing site"
            className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold leading-none bg-portal-accent/20 text-portal-accent border-portal-accent/40"
          >
            <Star className="w-3 h-3 fill-current" />
            Main
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

        <StatusControl packshot={packshot} busy={busy} onSetStatus={onSetStatus} />

        <div className="mt-auto pt-1 space-y-2">
          <PrimaryControl packshot={packshot} busy={busy} onSetPrimary={onSetPrimary} />
          <ApprovalControl packshot={packshot} busy={busy} onToggle={onToggle} />
        </div>
      </div>
    </div>
  )
}

// ─── Coverage ─────────────────────────────────────────────────────────────────

/**
 * The gap report. A product can reach `products` three ways — CSV import,
 * WooCommerce auto-import, or manual create — and none of them touch `media`, so
 * a product with no packshot was previously invisible: nothing anywhere asked the
 * question. This is the surface that makes a new item without an image show up as
 * a number instead of as an absence nobody noticed.
 */
function CoverageView() {
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.get<CoverageResponse>('/media/packshots/coverage')
      .then(d => { setData(d); setLoading(false) })
      .catch(err => { setError(err.message ?? 'Failed to load coverage'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-portal-accent" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
      </div>
    )
  }
  if (!data) return null

  const { missing, orphaned, discontinued, counts } = data
  const covered = counts.products_total - counts.products_missing

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile
          icon={ShieldCheck}
          value={covered}
          title={`Covered of ${counts.products_total} products`}
          subtitle="Has an approved, active packshot"
          tone="live"
        />
        <SummaryTile
          icon={ImageOff}
          value={counts.products_missing}
          title="No published image"
          subtitle="Product exists, nothing live for it"
          tone="awaiting"
        />
        <SummaryTile
          icon={Unlink}
          value={counts.orphaned}
          title="Orphaned packshots"
          subtitle="No product matches the SKU"
          tone="muted"
        />
      </div>

      <button
        onClick={load}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-portal-border bg-surface-elevated text-on-canvas-subtle hover:text-on-canvas transition-colors"
      >
        <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        Refresh
      </button>

      {/* Products with no published image */}
      <section className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-portal-border">
          <h3 className="text-on-canvas text-sm font-semibold flex items-center gap-2">
            <ImageOff className="w-4 h-4 text-amber-500" />
            Products with no published image ({missing.length})
          </h3>
          <p className="text-on-canvas-muted text-xs mt-1 leading-relaxed">
            A count in the "Packshots" column means files exist but none is approved and active —
            approve one in the queue. A zero means nothing has been imported for that SKU at all.
          </p>
        </header>
        {missing.length === 0 ? (
          <p className="px-4 py-6 text-on-canvas-muted text-sm text-center">
            Every product has a published image.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-on-canvas-muted text-[11px] uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2">Product</th>
                  <th className="text-left font-medium px-4 py-2">SKU</th>
                  <th className="text-left font-medium px-4 py-2">Brand</th>
                  <th className="text-left font-medium px-4 py-2">Size</th>
                  <th className="text-right font-medium px-4 py-2">Packshots</th>
                </tr>
              </thead>
              <tbody>
                {missing.map(m => (
                  <tr key={m.id} className="border-t border-portal-border">
                    <td className="px-4 py-2 text-on-canvas">{m.name}</td>
                    <td className="px-4 py-2 text-on-canvas-subtle font-mono text-xs">{m.sku}</td>
                    <td className="px-4 py-2 text-on-canvas-subtle">{m.brand ?? '—'}</td>
                    <td className="px-4 py-2 text-on-canvas-subtle">{m.unit_size ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                        m.packshot_count > 0
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40'
                          : 'bg-red-500/10 text-red-500 border-red-500/40',
                      )}>
                        {m.packshot_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Orphaned packshots */}
      <section className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-portal-border">
          <h3 className="text-on-canvas text-sm font-semibold flex items-center gap-2">
            <Unlink className="w-4 h-4 text-on-canvas-muted" />
            Orphaned packshots ({orphaned.length})
          </h3>
          <p className="text-on-canvas-muted text-xs mt-1 leading-relaxed">
            No product row matches these SKUs, so they lose their name and category and can never be
            a main image. Either the SKU is wrong or the product is missing from the catalog.
          </p>
        </header>
        {orphaned.length === 0 ? (
          <p className="px-4 py-6 text-on-canvas-muted text-sm text-center">
            Every packshot matches a product.
          </p>
        ) : (
          <ul className="divide-y divide-portal-border">
            {orphaned.map(o => (
              <li key={o.id} className="px-4 py-2.5 flex items-center gap-3">
                <img
                  src={o.thumbnail_url || o.file_url}
                  alt={displayName(o)}
                  loading="lazy"
                  className="w-10 h-10 object-contain bg-portal-bg rounded border border-portal-border flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-on-canvas text-sm truncate">{displayName(o)}</p>
                  <p className="text-on-canvas-muted text-xs font-mono truncate">
                    {o.sku ? `sku ${o.sku} — no product` : 'no sku'}
                  </p>
                </div>
                {o.approved === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 flex-shrink-0">
                    Live
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Discontinued */}
      <section className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-portal-border">
          <h3 className="text-on-canvas text-sm font-semibold flex items-center gap-2">
            <Ban className="w-4 h-4 text-on-canvas-muted" />
            Discontinued ({discontinued.length})
          </h3>
          <p className="text-on-canvas-muted text-xs mt-1 leading-relaxed">
            Marked off shelf. The agent reports these as discontinued rather than "not found", and the
            catalog still shows the image flagged as discontinued rather than falling back to nothing.
          </p>
        </header>
        {discontinued.length === 0 ? (
          <p className="px-4 py-6 text-on-canvas-muted text-sm text-center">
            Nothing is marked discontinued.
          </p>
        ) : (
          <ul className="divide-y divide-portal-border">
            {discontinued.map(d => (
              <li key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                <img
                  src={d.thumbnail_url || d.file_url}
                  alt={displayName(d)}
                  loading="lazy"
                  className="w-10 h-10 object-contain bg-portal-bg rounded border border-portal-border flex-shrink-0 opacity-60"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-on-canvas text-sm truncate">{displayName(d)}</p>
                  <p className="text-on-canvas-muted text-xs truncate">
                    {d.sku ? `sku ${d.sku}` : 'no sku'}
                    {d.status_set_by ? ` — set by ${d.status_set_by}` : ''}
                  </p>
                </div>
                {d.is_primary === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold bg-portal-accent/20 text-portal-accent border-portal-accent/40 flex-shrink-0">
                    Main
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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

  const [tab, setTab] = useState<'queue' | 'coverage'>('queue')
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

  /**
   * Status and primary are NOT optimistic, unlike approval above.
   *
   * Both have server-side consequences the client cannot predict: setting a
   * primary demotes whichever row previously held it (which may not even be on
   * screen under the current filter), and a status change alters whether the row
   * is publishable at all. Guessing either would show a state that never existed.
   * The server returns the authoritative row and counts, so we simply wait.
   */
  async function changeStatus(packshot: Packshot, next: PackshotStatus) {
    if (next === packshot.packshot_status) return
    setActionError('')
    setBusyIds(prev => [...prev, packshot.id])
    try {
      const res = await api.put<ToggleResponse>(
        `/media/packshots/${packshot.id}/status`,
        { status: next },
      )
      setItems(prev => prev.map(i => i.id === packshot.id ? res.item : i))
      setCounts(res.counts ?? EMPTY_COUNTS)
    } catch (err: any) {
      setActionError(`${displayName(packshot)}: ${err.message ?? 'Failed to change status'}`)
    } finally {
      setBusyIds(prev => prev.filter(id => id !== packshot.id))
    }
  }

  async function changePrimary(packshot: Packshot, next: boolean) {
    setActionError('')
    setBusyIds(prev => [...prev, packshot.id])
    try {
      const res = await api.put<ToggleResponse>(
        `/media/packshots/${packshot.id}/primary`,
        { primary: next },
      )
      // A promotion demotes the previous holder for this SKU, which may be
      // another card in view — clear the flag locally on every sibling so two
      // cards never both claim "Main".
      setItems(prev => prev.map(i => {
        if (i.id === packshot.id) return res.item
        if (next && i.sku && i.sku === packshot.sku) return { ...i, is_primary: 0 }
        return i
      }))
      setCounts(res.counts ?? EMPTY_COUNTS)
    } catch (err: any) {
      setActionError(`${displayName(packshot)}: ${err.message ?? 'Failed to set main image'}`)
    } finally {
      setBusyIds(prev => prev.filter(id => id !== packshot.id))
    }
  }

  const filtersActive = statusFilter !== 'all' || approvalFilter !== 'all' || !!debouncedSearch.trim()

  return (
    <div className="space-y-5">

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {([
          { value: 'queue',    label: 'Approval queue', icon: ListChecks },
          { value: 'coverage', label: 'Coverage',       icon: ImageOff },
        ] as const).map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              tab === t.value
                ? 'bg-portal-accent border-portal-accent text-white'
                : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas',
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'coverage' ? <CoverageView /> : <>

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
                onSetStatus={next => changeStatus(p, next)}
                onSetPrimary={next => changePrimary(p, next)}
              />
            ))}
          </div>
        </>
      )}

      </>}
    </div>
  )
}
