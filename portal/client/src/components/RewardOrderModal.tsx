import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  X, Loader2, ExternalLink, AlertTriangle, Trash2, Mail, Send, RefreshCw, Plus, Save,
  PackagePlus, CheckCircle2, ArrowLeft, History,
} from 'lucide-react'
import { api, ApiError } from '@/api/client'
import type {
  RewardOrder, RewardOrderDetail, RewardOrderLine, RewardOrderShipping, RewardOrderState,
  RewardRequest, WooOrderStatus, WooVariation,
} from '@/types'
import ProductPicker, { variationLabel, type PickedProduct } from './rewardOrder/ProductPicker'
import { TONE, STATE_LABEL, humanizeSlug, rewardOrderBadge, wooStatusTone } from './rewardOrder/badge'

// ─── Constants / helpers ──────────────────────────────────────────────────────

const EDITABLE: RewardOrderState[] = ['draft', 'failed']
/** Statuses that are hard to walk back (and `completed` also marks the reward fulfilled). */
const CONFIRM_STATUSES = new Set(['completed', 'cancelled', 'refunded'])

const SHIPPING_FIELDS: {
  key: keyof RewardOrderShipping
  label: string
  required: boolean
  autoComplete: string
  wide?: boolean
}[] = [
  { key: 'first_name', label: 'First name', required: true, autoComplete: 'off' },
  { key: 'last_name', label: 'Last name', required: true, autoComplete: 'off' },
  { key: 'company', label: 'Company', required: false, autoComplete: 'off', wide: true },
  { key: 'address_1', label: 'Address line 1', required: true, autoComplete: 'off', wide: true },
  { key: 'address_2', label: 'Address line 2', required: false, autoComplete: 'off', wide: true },
  { key: 'city', label: 'City', required: true, autoComplete: 'off' },
  { key: 'state', label: 'State', required: true, autoComplete: 'off' },
  { key: 'postcode', label: 'ZIP', required: true, autoComplete: 'off' },
  { key: 'country', label: 'Country', required: true, autoComplete: 'off' },
]

const KIND_LABEL: Record<RewardOrderLine['kind'], string> = { product: 'Product', shirt: 'T-shirt', pin: 'Pin' }

const EVENT_LABEL: Record<string, string> = {
  drafted: 'Draft built', edited: 'Draft edited', pushed: 'Pushed to WooCommerce',
  push_failed: 'Push failed', status: 'Status changed', refreshed: 'Refreshed from WooCommerce',
  emailed: 'Emailed partner', deleted: 'Deleted',
}

const EMPTY_SHIPPING: RewardOrderShipping = {
  first_name: '', last_name: '', company: '', address_1: '', address_2: '',
  city: '', state: '', postcode: '', country: 'US',
}

interface Form {
  lines: RewardOrderLine[]
  shipping: RewardOrderShipping
  customer_note: string
}

function formFrom(order: RewardOrder | null): Form {
  return {
    lines: order ? order.lines.map(l => ({ ...l })) : [],
    shipping: { ...EMPTY_SHIPPING, ...(order?.shipping ?? {}) },
    customer_note: order?.customer_note ?? '',
  }
}

function sameForm(a: Form, b: Form) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Client mirror of the server's push check, used only while there are unsaved edits. */
function localIssues(form: Form): string[] {
  const issues: string[] = []
  if (form.lines.length === 0) issues.push('The order has no line items.')
  form.lines.forEach(l => {
    const name = l.name || KIND_LABEL[l.kind]
    if (l.issue) issues.push(`${name}: ${l.issue}`)
    else if (!l.woo_product_id) issues.push(`${name}: no WooCommerce product selected.`)
    if (!Number.isInteger(l.quantity) || l.quantity < 1) issues.push(`${name}: quantity must be at least 1.`)
  })
  const missing = SHIPPING_FIELDS.filter(f => f.required && !form.shipping[f.key]?.trim()).map(f => f.label)
  if (missing.length) issues.push(`Shipping address is missing: ${missing.join(', ')}.`)
  return issues
}

function errText(err: unknown, fallback = 'Something went wrong') {
  if (err instanceof ApiError || err instanceof Error) return err.message || fallback
  return fallback
}

/** SQLite timestamps arrive as 'YYYY-MM-DD HH:MM:SS' UTC; make them parse as UTC. */
function parseTs(ts: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z')
}
function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = parseTs(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = parseTs(ts)
  return isNaN(d.getTime()) ? ts : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "Sliquid Tee — M" → "Sliquid Tee": the size suffix is replaced, not stacked. */
function baseName(name: string) {
  const i = name.indexOf(' — ')
  return i === -1 ? name : name.slice(0, i)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const inputCls =
  'w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-1.5 text-on-canvas text-sm ' +
  'focus:outline-none focus:border-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent/40'
const btnBase =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface'
const btnPrimary = `${btnBase} bg-portal-accent border-portal-accent text-white hover:bg-portal-accent-hover hover:border-portal-accent-hover`
const btnSecondary = `${btnBase} bg-surface border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500`
const btnDanger = `${btnBase} bg-red-500/10 border-red-600/40 text-red-800 dark:text-red-300 hover:bg-red-500/20`

type Busy =
  | 'load' | 'draft' | 'save' | 'push' | 'delete' | 'status' | 'refresh' | 'email' | null

// ─── Small presentational pieces ──────────────────────────────────────────────

function Badge({ label, tone }: { label: string; tone: keyof typeof TONE }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${TONE[tone]}`}>{label}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-on-canvas-muted text-[11px] font-medium uppercase tracking-wider">{label}</dt>
      <dd className="text-on-canvas-subtle text-sm mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function Spinner({ on }: { on: boolean }) {
  return on ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null
}

function InlineError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-600/40 bg-red-500/10 text-red-800 dark:text-red-300 text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

function RequestedPanel({ request, wooCustomerId }: { request: RewardRequest; wooCustomerId: number | null }) {
  return (
    <section aria-labelledby="ro-requested" className="space-y-4">
      <h3 id="ro-requested" className="text-on-canvas text-sm font-semibold">Requested</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Partner">{request.full_name}</Field>
        <Field label="Email"><a className="text-portal-accent hover:underline" href={`mailto:${request.email}`}>{request.email}</a></Field>
        <Field label="Company">{request.company || '—'}</Field>
        <Field label="Certificate #">{request.certificate_number || '—'}</Field>
        <Field label="Average score">{request.avg_score != null ? `${request.avg_score}%` : '—'}</Field>
        <Field label="Submitted">{fmtDate(request.submitted_at)}</Field>
      </dl>
      <div className="border-t border-portal-border pt-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2">
            <Field label="Product as claimed">
              {request.product}
              {request.product_sku
                ? <span className="block text-xs text-on-canvas-muted">SKU {request.product_sku}</span>
                : <span className="block text-xs text-amber-800 dark:text-amber-300">No SKU recorded — choose the product in the order</span>}
            </Field>
          </div>
          <Field label="Shirt size">{request.shirt_size || '—'}</Field>
          <Field label="Fulfilled">
            {request.fulfilled ? `Yes${request.fulfilled_at ? ` · ${fmtDate(request.fulfilled_at)}` : ''}` : 'Not yet'}
          </Field>
          <div className="col-span-2">
            <Field label="Shipping address">
              <span className="block">{request.full_name}</span>
              <span className="block">{request.address1}</span>
              {request.address2 && <span className="block">{request.address2}</span>}
              <span className="block">{request.city}, {request.state} {request.zip}</span>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="WooCommerce customer">
              {wooCustomerId ? `Existing WooCommerce customer #${wooCustomerId}` : 'Guest order (no WooCommerce account for this email)'}
            </Field>
          </div>
        </dl>
      </div>
    </section>
  )
}

function ShipToBlock({ s }: { s: RewardOrderShipping }) {
  return (
    <address className="not-italic text-sm text-on-canvas-subtle leading-relaxed">
      <span className="block text-on-canvas">{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}</span>
      {s.company && <span className="block">{s.company}</span>}
      <span className="block">{s.address_1}</span>
      {s.address_2 && <span className="block">{s.address_2}</span>}
      <span className="block">{[s.city, s.state].filter(Boolean).join(', ')} {s.postcode}</span>
      <span className="block">{s.country}</span>
    </address>
  )
}

function ReadOnlyLines({ lines }: { lines: RewardOrderLine[] }) {
  return (
    <div className="overflow-x-auto border border-portal-border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-surface-elevated text-on-canvas-muted text-[11px] uppercase tracking-wider">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Item</th>
            <th scope="col" className="text-left font-medium px-3 py-2">SKU</th>
            <th scope="col" className="text-left font-medium px-3 py-2">Kind</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Qty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-portal-border">
          {lines.map((l, i) => (
            <tr key={i} className={l.issue ? 'bg-amber-500/10' : ''}>
              <td className="px-3 py-2 text-on-canvas">
                {l.name}
                {l.issue && <span className="block text-xs text-amber-800 dark:text-amber-300">{l.issue}</span>}
              </td>
              <td className="px-3 py-2 text-on-canvas-subtle">{l.sku || '—'}</td>
              <td className="px-3 py-2 text-on-canvas-subtle">{KIND_LABEL[l.kind]}</td>
              <td className="px-3 py-2 text-right text-on-canvas-subtle">{l.quantity}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-3 text-on-canvas-muted text-sm">No line items.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TotalRow() {
  return (
    <p className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-elevated border border-portal-border text-sm">
      <span className="text-on-canvas font-medium">Order total $0.00</span>
      <span className="text-on-canvas-muted text-xs">free reward</span>
    </p>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function RewardOrderModal({
  rewardId,
  canEdit,
  onClose,
  onChanged,
}: {
  rewardId: number
  canEdit: boolean
  onClose: () => void
  onChanged?: (detail: RewardOrderDetail) => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const [detail, setDetail] = useState<RewardOrderDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState<Busy>('load')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState<Form>(() => formFrom(null))
  const [statuses, setStatuses] = useState<WooOrderStatus[] | null>(null)
  const [shirtVariations, setShirtVariations] = useState<Record<number, WooVariation[] | 'error'>>({})
  const stashedPin = useRef<RewardOrderLine | null>(null)

  const [pickerTarget, setPickerTarget] = useState<number | 'add' | null>(null)
  const [confirmPush, setConfirmPush] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRebuild, setConfirmRebuild] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailMessage, setEmailMessage] = useState('')
  const [emailSentTo, setEmailSentTo] = useState('')

  const order = detail?.order ?? null
  const state = order?.state ?? null
  const editable = canEdit && !!order && EDITABLE.includes(order.state)
  const savedForm = useMemo(() => formFrom(order), [order])
  const dirty = editable && !sameForm(form, savedForm)
  const issues = dirty ? localIssues(form) : (order?.issues ?? [])

  // ── Data ──
  const apply = useCallback((d: RewardOrderDetail, opts: { resetForm: boolean }) => {
    setDetail(d)
    if (opts.resetForm) {
      setForm(formFrom(d.order))
      stashedPin.current = null
    }
    onChanged?.(d)
  }, [onChanged])

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setBusy('load')
    setLoadError('')
    try {
      const d = await api.get<RewardOrderDetail>(`/reward-orders/${rewardId}`)
      setDetail(d)
      setForm(formFrom(d.order))
      stashedPin.current = null
      return d
    } catch (err) {
      if (!opts.silent) setLoadError(errText(err, 'Could not load this reward'))
      return null
    } finally {
      if (!opts.silent) setBusy(null)
    }
  }, [rewardId])

  useEffect(() => { void load() }, [load])

  // Statuses only matter once an order exists in Woo.
  useEffect(() => {
    if (state !== 'pushed' || statuses) return
    api.get<WooOrderStatus[]>('/reward-orders/meta/statuses')
      .then(setStatuses)
      .catch(() => setStatuses([]))
  }, [state, statuses])

  // Variation list for every shirt line's product, so its size select maps to real variations.
  const shirtProductIds = useMemo(
    () => [...new Set(form.lines.filter(l => l.kind === 'shirt' && l.woo_product_id).map(l => l.woo_product_id as number))],
    [form.lines],
  )
  const requestedVariations = useRef(new Set<number>())
  useEffect(() => {
    if (!editable) return
    shirtProductIds.forEach(id => {
      if (requestedVariations.current.has(id)) return
      requestedVariations.current.add(id)
      api.get<WooVariation[]>(`/reward-orders/meta/products/${id}/variations`)
        .then(v => setShirtVariations(prev => ({ ...prev, [id]: v })))
        .catch(() => setShirtVariations(prev => ({ ...prev, [id]: 'error' })))
    })
  }, [editable, shirtProductIds])

  // ── Focus management ──
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    return () => { restoreFocusRef.current?.focus?.() }
  }, [])
  useEffect(() => {
    // Once content is in, move focus inside the dialog (first focusable control).
    if (busy === 'load') return
    const root = dialogRef.current
    if (!root || root.contains(document.activeElement)) return
    root.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [busy])

  const anyConfirmOpen = confirmPush || confirmDelete || confirmRebuild || confirmClose || pendingStatus !== null || emailOpen || pickerTarget !== null

  const requestClose = useCallback(() => {
    if (dirty) { setConfirmClose(true); return }
    onClose()
  }, [dirty, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // Escape backs out of the innermost open step before it ever closes the dialog.
        if (confirmClose) setConfirmClose(false)
        else if (pendingStatus !== null) setPendingStatus(null)
        else if (confirmDelete) setConfirmDelete(false)
        else if (confirmRebuild) setConfirmRebuild(false)
        else if (confirmPush) setConfirmPush(false)
        else if (pickerTarget !== null) setPickerTarget(null)
        else if (emailOpen) setEmailOpen(false)
        else requestClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const els = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null)
        if (els.length === 0) return
        const first = els[0], last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [confirmClose, pendingStatus, confirmDelete, confirmRebuild, confirmPush, pickerTarget, emailOpen, requestClose])

  // ── Writes ──
  async function run(kind: Exclude<Busy, null | 'load'>, fn: () => Promise<RewardOrderDetail>, resetForm: boolean) {
    setBusy(kind)
    setError('')
    setNotice('')
    try {
      const d = await fn()
      apply(d, { resetForm })
      return d
    } catch (err) {
      setError(errText(err))
      return null
    } finally {
      setBusy(null)
    }
  }

  function patchBody() {
    return {
      lines: form.lines,
      shipping: form.shipping,
      customer_note: form.customer_note.trim() ? form.customer_note : null,
    }
  }

  const buildDraft = () => {
    setConfirmRebuild(false)
    return run('draft', () => api.post<RewardOrderDetail>(`/reward-orders/${rewardId}/draft`, {}), true)
  }

  const save = () => run('save', () => api.put<RewardOrderDetail>(`/reward-orders/${rewardId}`, patchBody()), true)

  async function startPush() {
    if (dirty) {
      const d = await save()
      if (!d) return
      if (d.order?.issues.length) return // the server found something still blocking; it is listed
    }
    setConfirmPush(true)
  }

  async function confirmPushNow() {
    setBusy('push')
    setError('')
    setNotice('')
    try {
      const d = await api.post<RewardOrderDetail>(`/reward-orders/${rewardId}/push`, {})
      apply(d, { resetForm: true })
      if (d.order?.state === 'failed') setError(d.order.last_error || 'WooCommerce rejected the order.')
      else setNotice('Order created in WooCommerce.')
    } catch (err) {
      setError(errText(err, 'Push failed'))
      // A failed push still changes server state (failed / last_error) — pick it up.
      const d = await load({ silent: true })
      if (d) onChanged?.(d)
    } finally {
      setBusy(null)
      setConfirmPush(false)
    }
  }

  async function doDelete() {
    const d = await run('delete', () => api.delete<RewardOrderDetail>(`/reward-orders/${rewardId}`), true)
    setConfirmDelete(false)
    if (d) setNotice(d.order?.woo_order_id ? 'Order moved to trash in WooCommerce.' : 'Draft discarded.')
  }

  async function changeStatus(slug: string) {
    setPendingStatus(null)
    const d = await run('status', () => api.put<RewardOrderDetail>(`/reward-orders/${rewardId}/status`, { status: slug }), true)
    if (d) setNotice(`Status set to ${statusName(slug)}.`)
  }

  async function refresh() {
    const d = await run('refresh', () => api.post<RewardOrderDetail>(`/reward-orders/${rewardId}/refresh`, {}), true)
    if (d) setNotice('Refreshed from WooCommerce.')
  }

  async function sendEmail() {
    const msg = emailMessage.trim()
    // Email never touches the order draft, so unsaved edits survive it.
    const d = await run('email', () => api.post<RewardOrderDetail>(`/reward-orders/${rewardId}/email`, msg ? { message: msg } : {}), false)
    if (d) {
      setEmailSentTo(d.request.email)
      setEmailMessage('')
      setEmailOpen(false)
    }
  }

  // ── Local edits ──
  function setLine(i: number, patch: Partial<RewardOrderLine>) {
    setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  }
  function removeLine(i: number) {
    setForm(f => {
      const line = f.lines[i]
      if (line?.kind === 'pin') stashedPin.current = line
      return { ...f, lines: f.lines.filter((_, j) => j !== i) }
    })
  }
  function onPicked(p: PickedProduct) {
    const target = pickerTarget
    setPickerTarget(null)
    const resolved = { sku: p.sku, woo_product_id: p.woo_product_id, woo_variation_id: p.woo_variation_id, name: p.name, issue: null }
    if (target === 'add') {
      setForm(f => ({ ...f, lines: [...f.lines, { kind: 'product', quantity: 1, ...resolved }] }))
    } else if (typeof target === 'number') {
      setLine(target, resolved)
    }
  }
  const hasPin = form.lines.some(l => l.kind === 'pin')
  function togglePin(on: boolean) {
    if (!on) {
      const i = form.lines.findIndex(l => l.kind === 'pin')
      if (i !== -1) removeLine(i)
      return
    }
    const restored: RewardOrderLine = stashedPin.current ?? {
      kind: 'pin', sku: null, woo_product_id: null, woo_variation_id: null, name: 'Reward pin', quantity: 1,
      issue: 'Choose the pin product (or map it in the Admin Dashboard).',
    }
    stashedPin.current = null
    setForm(f => ({ ...f, lines: [...f.lines, restored] }))
  }
  function setShirtVariation(i: number, line: RewardOrderLine, variationId: number) {
    const list = line.woo_product_id ? shirtVariations[line.woo_product_id] : undefined
    const v = Array.isArray(list) ? list.find(x => x.id === variationId) : undefined
    if (!v) return
    setLine(i, { woo_variation_id: v.id, sku: v.sku || line.sku, name: `${baseName(line.name)} — ${variationLabel(v)}`, issue: null })
  }

  function statusName(slug: string) {
    return statuses?.find(s => s.slug === slug)?.name ?? humanizeSlug(slug)
  }

  // ── Render pieces ──
  const request = detail?.request
  const badge = order ? rewardOrderBadge({ order_state: order.state, woo_status: order.woo_status, woo_order_number: order.woo_order_number }, statusName) : null

  function renderEditor() {
    return (
      <div className="space-y-5">
        {/* Lines */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider">Line items</h4>
            <button type="button" className={btnSecondary} onClick={() => setPickerTarget('add')} disabled={pickerTarget !== null}>
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add product
            </button>
          </div>
          <div className="overflow-x-auto border border-portal-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-on-canvas-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th scope="col" className="text-left font-medium px-3 py-2">Item</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">SKU</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">Kind</th>
                  <th scope="col" className="text-left font-medium px-3 py-2 w-20">Qty</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-portal-border">
                {form.lines.map((l, i) => {
                  const variations = l.kind === 'shirt' && l.woo_product_id ? shirtVariations[l.woo_product_id] : undefined
                  const qtyId = `ro-qty-${i}`
                  const sizeId = `ro-size-${i}`
                  return (
                    <tr key={i} className={l.issue ? 'bg-amber-500/10' : ''}>
                      <td className="px-3 py-2 align-top min-w-[12rem]">
                        <span className="block text-on-canvas">{l.name || '(unnamed item)'}</span>
                        {l.issue && (
                          <span className="flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" aria-hidden /> {l.issue}
                          </span>
                        )}
                        {l.kind === 'shirt' && l.woo_product_id && (
                          <div className="mt-1.5">
                            <label htmlFor={sizeId} className="block text-[11px] text-on-canvas-muted mb-0.5">Shirt size</label>
                            {variations === 'error' ? (
                              <span className="text-xs text-red-700 dark:text-red-300">Could not load sizes from WooCommerce.</span>
                            ) : !variations ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-portal-accent" aria-label="Loading sizes" />
                            ) : (
                              <select
                                id={sizeId}
                                value={l.woo_variation_id ?? ''}
                                onChange={e => setShirtVariation(i, l, Number(e.target.value))}
                                className={`${inputCls} py-1`}
                              >
                                <option value="" disabled>Choose a size…</option>
                                {variations.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {variationLabel(v)}{v.stock_status === 'outofstock' ? ' (out of stock)' : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-on-canvas-subtle">{l.sku || '—'}</td>
                      <td className="px-3 py-2 align-top text-on-canvas-subtle">{KIND_LABEL[l.kind]}</td>
                      <td className="px-3 py-2 align-top">
                        <label htmlFor={qtyId} className="sr-only">Quantity for {l.name || KIND_LABEL[l.kind]}</label>
                        <input
                          id={qtyId}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={Number.isFinite(l.quantity) ? l.quantity : ''}
                          onChange={e => setLine(i, { quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                          className={`${inputCls} w-16 py-1`}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            className={btnSecondary}
                            onClick={() => setPickerTarget(i)}
                            disabled={pickerTarget !== null}
                            aria-label={`Change product for ${l.name || KIND_LABEL[l.kind]}`}
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} px-2`}
                            onClick={() => removeLine(i)}
                            aria-label={`Remove ${l.name || KIND_LABEL[l.kind]}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {form.lines.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-on-canvas-muted text-sm">No line items. Add a product.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pickerTarget !== null && (
            <ProductPicker
              title={pickerTarget === 'add'
                ? 'Add a product'
                : `Replace “${form.lines[pickerTarget]?.name || KIND_LABEL[form.lines[pickerTarget]?.kind ?? 'product']}”`}
              onPick={onPicked}
              onCancel={() => setPickerTarget(null)}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-on-canvas-subtle mt-2 w-fit cursor-pointer">
            <input
              type="checkbox"
              checked={hasPin}
              onChange={e => togglePin(e.target.checked)}
              className="w-4 h-4 accent-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent"
            />
            Include the reward pin
          </label>
          <TotalRow />
        </div>

        {/* Shipping */}
        <fieldset className="space-y-2">
          <legend className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-2">Ship to</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SHIPPING_FIELDS.map(f => {
              const id = `ro-ship-${f.key}`
              const empty = f.required && !form.shipping[f.key]?.trim()
              return (
                <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                  <label htmlFor={id} className="block text-xs text-on-canvas-subtle mb-1">
                    {f.label}{f.required && <span className="text-portal-accent" aria-hidden> *</span>}
                  </label>
                  <input
                    id={id}
                    value={form.shipping[f.key] ?? ''}
                    required={f.required}
                    aria-invalid={empty || undefined}
                    autoComplete={f.autoComplete}
                    onChange={e => setForm(prev => ({ ...prev, shipping: { ...prev.shipping, [f.key]: e.target.value } }))}
                    className={`${inputCls} ${empty ? 'border-amber-600/60' : ''}`}
                  />
                </div>
              )
            })}
          </div>
        </fieldset>

        {/* Note */}
        <div>
          <label htmlFor="ro-note" className="block text-on-canvas text-xs font-semibold uppercase tracking-wider mb-1">
            Customer note
          </label>
          <textarea
            id="ro-note"
            rows={3}
            value={form.customer_note}
            onChange={e => setForm(prev => ({ ...prev, customer_note: e.target.value }))}
            placeholder="Optional — shown on the WooCommerce order and in its customer emails"
            className={`${inputCls} resize-y`}
          />
        </div>
      </div>
    )
  }

  function renderPushConfirm() {
    if (!order) return null
    return (
      <div className="space-y-4 p-4 rounded-xl border border-portal-accent/40 bg-portal-accent/5" role="group" aria-labelledby="ro-confirm-title">
        <h4 id="ro-confirm-title" className="text-on-canvas text-sm font-semibold">Confirm: create this order in WooCommerce</h4>
        <div>
          <p className="text-on-canvas-muted text-[11px] font-medium uppercase tracking-wider mb-1">Items</p>
          <ul className="text-sm text-on-canvas-subtle space-y-0.5">
            {order.lines.map((l, i) => (
              <li key={i}>{l.name}{l.sku ? ` (SKU ${l.sku})` : ''} × {l.quantity}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-on-canvas-muted text-[11px] font-medium uppercase tracking-wider mb-1">Ship to</p>
          <ShipToBlock s={order.shipping} />
        </div>
        <div>
          <p className="text-on-canvas-muted text-[11px] font-medium uppercase tracking-wider mb-1">Customer note</p>
          <p className="text-sm text-on-canvas-subtle whitespace-pre-wrap">{order.customer_note || 'None'}</p>
        </div>
        <TotalRow />
        <p className="text-xs text-on-canvas-muted">
          Sent to {request?.email} as {detail?.woo_customer_id ? `WooCommerce customer #${detail.woo_customer_id}` : 'a guest order'}.
          WooCommerce will email the customer its standard order emails.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={confirmPushNow} disabled={busy !== null} autoFocus>
            <Spinner on={busy === 'push'} />{busy !== 'push' && <Send className="w-3.5 h-3.5" aria-hidden />} Confirm and push
          </button>
          <button type="button" className={btnSecondary} onClick={() => setConfirmPush(false)} disabled={busy === 'push'}>
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back
          </button>
        </div>
      </div>
    )
  }

  function renderPushed() {
    if (!order) return null
    const current = order.woo_status ?? ''
    const options = statuses ?? []
    const withCurrent = current && !options.some(s => s.slug === current)
      ? [{ slug: current, name: humanizeSlug(current) }, ...options]
      : options
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ro-status" className="block text-xs text-on-canvas-subtle mb-1">WooCommerce status</label>
            {canEdit ? (
              <select
                id="ro-status"
                value={pendingStatus ?? current}
                disabled={busy !== null || statuses === null}
                onChange={e => {
                  const slug = e.target.value
                  if (slug === current) return
                  if (CONFIRM_STATUSES.has(slug)) setPendingStatus(slug)
                  else void changeStatus(slug)
                }}
                className={`${inputCls} min-w-[11rem]`}
              >
                {withCurrent.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            ) : (
              <p id="ro-status"><Badge label={current ? statusName(current) : 'Unknown'} tone={wooStatusTone(current)} /></p>
            )}
          </div>
          {busy === 'status' && <Loader2 className="w-4 h-4 animate-spin text-portal-accent mb-2" aria-label="Updating status" />}
          {canEdit && (
            <button type="button" className={btnSecondary} onClick={refresh} disabled={busy !== null}>
              {busy === 'refresh' ? <Spinner on /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden />} Refresh
            </button>
          )}
          <p className="text-xs text-on-canvas-muted mb-2">Last synced {fmtDateTime(order.last_synced_at)}</p>
        </div>

        {pendingStatus && (
          <div role="group" aria-labelledby="ro-status-confirm" className="p-3 rounded-lg border border-amber-600/40 bg-amber-500/10 space-y-2">
            <p id="ro-status-confirm" className="text-sm text-on-canvas">
              Set this order to <strong>{statusName(pendingStatus)}</strong>?
            </p>
            <p className="text-xs text-on-canvas-subtle">
              {pendingStatus === 'completed'
                ? 'This also marks the reward as fulfilled in the portal. WooCommerce may email the customer.'
                : 'WooCommerce may email the customer about this change.'}
            </p>
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} onClick={() => changeStatus(pendingStatus)} disabled={busy !== null} autoFocus>
                Confirm
              </button>
              <button type="button" className={btnSecondary} onClick={() => setPendingStatus(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider">Line items</h4>
          <ReadOnlyLines lines={order.lines} />
          <TotalRow />
        </div>
        <div>
          <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-1">Ship to</h4>
          <ShipToBlock s={order.shipping} />
        </div>
        <div>
          <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-1">Customer note</h4>
          <p className="text-sm text-on-canvas-subtle whitespace-pre-wrap">{order.customer_note || 'None'}</p>
        </div>
        <p className="text-xs text-on-canvas-muted">Pushed {fmtDateTime(order.pushed_at)}</p>
      </div>
    )
  }

  function renderRight() {
    if (!detail) return null
    if (!order) {
      return (
        <div className="space-y-3">
          {canEdit ? (
            <>
              <p className="text-sm text-on-canvas-subtle">
                No order yet. Building a draft turns this claim into a $0 WooCommerce order you can review and edit
                before anything is sent. Nothing reaches WooCommerce until you push it.
              </p>
              <button type="button" className={btnPrimary} onClick={buildDraft} disabled={busy !== null}>
                {busy === 'draft' ? <Spinner on /> : <PackagePlus className="w-3.5 h-3.5" aria-hidden />} Build order draft
              </button>
            </>
          ) : (
            <p className="text-sm text-on-canvas-muted">No order yet.</p>
          )}
        </div>
      )
    }
    if (order.state === 'deleted') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-on-canvas-subtle">
            {order.woo_order_id
              ? 'Order deleted (moved to trash in WooCommerce).'
              : 'The draft was discarded.'}
          </p>
          {canEdit && (
            <button type="button" className={btnPrimary} onClick={buildDraft} disabled={busy !== null}>
              {busy === 'draft' ? <Spinner on /> : <PackagePlus className="w-3.5 h-3.5" aria-hidden />} Build new draft
            </button>
          )}
        </div>
      )
    }
    if (order.state === 'pushing') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-on-canvas-subtle">A push to WooCommerce is in progress for this order.</p>
          <button type="button" className={btnSecondary} onClick={() => void load()} disabled={busy !== null}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Reload
          </button>
        </div>
      )
    }
    if (order.state === 'pushed') return renderPushed()

    // draft / failed
    return (
      <div className="space-y-4">
        {order.state === 'failed' && order.last_error && (
          <div role="alert" className="p-3 rounded-lg border border-red-600/50 bg-red-500/10">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800 dark:text-red-300">
              <AlertTriangle className="w-4 h-4" aria-hidden /> The last push to WooCommerce failed
            </p>
            <p className="text-sm text-red-800 dark:text-red-300 mt-1 break-words">{order.last_error}</p>
            {canEdit && <p className="text-xs text-on-canvas-subtle mt-1">Fix anything below if needed, then use Retry push.</p>}
          </div>
        )}
        {confirmPush ? renderPushConfirm() : canEdit ? (
          <>
            {renderEditor()}
            <div className="flex flex-wrap items-center gap-2 text-xs text-on-canvas-muted">
              {confirmRebuild ? (
                <>
                  <span>Rebuild from the claim{dirty ? ' and discard your unsaved edits' : ''}?</span>
                  <button type="button" className={btnDanger} onClick={buildDraft} disabled={busy !== null} autoFocus>
                    <Spinner on={busy === 'draft'} /> Rebuild
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setConfirmRebuild(false)}>Cancel</button>
                </>
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-on-canvas rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
                  onClick={() => setConfirmRebuild(true)}
                  disabled={busy !== null}
                >
                  Rebuild draft from the claim
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <ReadOnlyLines lines={order.lines} />
            <TotalRow />
            <div>
              <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-1">Ship to</h4>
              <ShipToBlock s={order.shipping} />
            </div>
            <div>
              <h4 className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-1">Customer note</h4>
              <p className="text-sm text-on-canvas-subtle whitespace-pre-wrap">{order.customer_note || 'None'}</p>
            </div>
          </>
        )}

        {!confirmPush && issues.length > 0 && (
          <div className="p-3 rounded-lg border border-amber-600/40 bg-amber-500/10" aria-live="polite">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {canEdit ? 'Fix before pushing:' : 'Blocking issues:'}
            </p>
            <ul className="list-disc pl-5 mt-1 text-sm text-amber-800 dark:text-amber-300 space-y-0.5">
              {issues.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const rightTitle = order && (order.state === 'pushed' || (order.state === 'deleted' && order.woo_order_id))
    ? 'WooCommerce order'
    : 'Order to be created'

  const deleteLabel = state === 'pushed' ? 'Move order to trash' : 'Discard draft'
  const canDelete = canEdit && (state === 'draft' || state === 'failed' || state === 'pushed')

  // ── Render ──
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !anyConfirmOpen) requestClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-surface border border-portal-border rounded-xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-portal-border">
          <div className="min-w-0">
            <h2 id={titleId} className="text-on-canvas font-semibold truncate">
              Reward order{request ? ` — ${request.full_name}` : ''}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {badge ? <Badge label={badge.label} tone={badge.tone} /> : detail && <Badge label="No order" tone="neutral" />}
              {order?.woo_order_number && order.woo_admin_url && order.state === 'pushed' && (
                <a
                  href={order.woo_admin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-portal-accent hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
                >
                  WooCommerce order #{order.woo_order_number} <ExternalLink className="w-3 h-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="p-1 rounded-lg text-on-canvas-muted hover:text-on-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {busy === 'load' && !detail ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-portal-accent" aria-label="Loading reward" />
            </div>
          ) : loadError && !detail ? (
            <div className="py-10 space-y-3 text-center">
              <InlineError message={loadError} />
              <button type="button" className={btnSecondary} onClick={() => void load()}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Try again
              </button>
            </div>
          ) : detail && request ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
                <div className="lg:border-r lg:border-portal-border lg:pr-6">
                  <RequestedPanel request={request} wooCustomerId={detail.woo_customer_id} />
                </div>
                <section aria-labelledby="ro-order" className="space-y-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 id="ro-order" className="text-on-canvas text-sm font-semibold">{rightTitle}</h3>
                    {order && order.state !== 'pushed' && <Badge label={STATE_LABEL[order.state]} tone={order.state === 'failed' ? 'bad' : 'neutral'} />}
                    {dirty && <span className="text-xs text-amber-800 dark:text-amber-300">Unsaved changes</span>}
                  </div>
                  {renderRight()}
                </section>
              </div>

              {/* Activity */}
              {detail.events.length > 0 && (
                <section aria-labelledby="ro-activity" className="border-t border-portal-border pt-4">
                  <h3 id="ro-activity" className="flex items-center gap-1.5 text-on-canvas text-sm font-semibold mb-2">
                    <History className="w-4 h-4 text-on-canvas-muted" aria-hidden /> Activity
                  </h3>
                  <ol className="space-y-1.5">
                    {detail.events.map(ev => (
                      <li key={ev.id} className="text-sm flex flex-wrap gap-x-2">
                        <span className="text-on-canvas font-medium">{EVENT_LABEL[ev.action] ?? humanizeSlug(ev.action)}</span>
                        {ev.detail && <span className="text-on-canvas-subtle break-words">{ev.detail}</span>}
                        <span className="text-on-canvas-muted text-xs self-center">
                          {[ev.actor_name, fmtDateTime(ev.created_at)].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {detail && (
          <div className="border-t border-portal-border px-5 py-3 space-y-3">
            <InlineError message={error} />
            {notice && !error && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" aria-hidden /> {notice}
              </p>
            )}
            {emailSentTo && !emailOpen && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-300">
                <Mail className="w-4 h-4" aria-hidden /> Email sent to {emailSentTo}.
              </p>
            )}

            {canEdit && emailOpen && (
              <div className="p-3 rounded-lg border border-portal-border bg-surface-elevated space-y-2">
                <label htmlFor="ro-email-msg" className="block text-xs text-on-canvas-subtle">
                  Message to {request?.full_name} ({request?.email}) — optional. The email already includes the order number and status.
                </label>
                <textarea
                  id="ro-email-msg"
                  rows={3}
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  className={`${inputCls} resize-y`}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={sendEmail} disabled={busy !== null}>
                    {busy === 'email' ? <Spinner on /> : <Send className="w-3.5 h-3.5" aria-hidden />} Send email
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setEmailOpen(false)} disabled={busy === 'email'}>Cancel</button>
                </div>
              </div>
            )}

            {confirmClose ? (
              <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Unsaved changes">
                <span className="text-sm text-on-canvas-subtle mr-auto">You have unsaved changes to this order.</span>
                <button type="button" className={btnDanger} onClick={onClose} autoFocus>Discard and close</button>
                <button type="button" className={btnSecondary} onClick={() => setConfirmClose(false)}>Keep editing</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {canDelete && (
                  confirmDelete ? (
                    <>
                      <button type="button" className={btnDanger} onClick={doDelete} disabled={busy !== null} autoFocus>
                        {busy === 'delete' ? <Spinner on /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />}
                        Confirm: {deleteLabel.toLowerCase()}
                      </button>
                      <button type="button" className={btnSecondary} onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className={btnDanger} onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                      <Trash2 className="w-3.5 h-3.5" aria-hidden /> {deleteLabel}
                    </button>
                  )
                )}
                {/* The partner email quotes the Woo order number, so the server
                    only sends it once the order is pushed (409 otherwise). */}
                {canEdit && !emailOpen && state === 'pushed' && (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => { setEmailOpen(true); setEmailSentTo('') }}
                    disabled={busy !== null}
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden /> Email user
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button type="button" className={btnSecondary} onClick={requestClose}>Close</button>
                  {editable && !confirmPush && (
                    <>
                      <button type="button" className={btnSecondary} onClick={() => void save()} disabled={!dirty || busy !== null}>
                        {busy === 'save' ? <Spinner on /> : <Save className="w-3.5 h-3.5" aria-hidden />} Save changes
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        onClick={() => void startPush()}
                        disabled={busy !== null || issues.length > 0 || pickerTarget !== null}
                        title={issues.length > 0 ? 'Resolve the listed issues first' : undefined}
                      >
                        {busy === 'push' ? <Spinner on /> : <Send className="w-3.5 h-3.5" aria-hidden />}
                        {state === 'failed' ? 'Retry push' : 'Push to WooCommerce'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
