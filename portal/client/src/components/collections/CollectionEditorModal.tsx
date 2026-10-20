import { FormEvent, useEffect, useId, useReducer, useRef, useState } from 'react'
import {
  X, Loader2, Upload, Star, Trash2, ChevronLeft, ChevronRight, RotateCcw, Ban, Send, CalendarClock,
  EyeOff, CheckCircle2, AlertTriangle, Images, Save,
} from 'lucide-react'
import { api } from '@/api/client'
import type { AssetCollection, AssetCollectionDetail, CollectionPhoto, CollectionUploadResult } from '@/types'
import { formatDateTime, fromLocalInputValue, timeUntil, toLocalInputValue } from '@/lib/utils'
import Dialog, { FOCUS_RING } from './Dialog'
import { BrandSelect, toBrandOpt } from './shared'

// Admin-only surface: all copy stays English (see CLAUDE.md i18n notes).

const FILES_PER_REQUEST = 3
const REQUESTS_IN_FLIGHT = 2

type QStatus = 'queued' | 'uploading' | 'done' | 'failed'
interface QItem {
  key: string
  file: File
  status: QStatus
  message?: string
  /** The photo row this file became, once uploaded — used to restore file order. */
  photoId?: number
}

const fingerprint = (f: File) => `${f.name}|${f.size}|${f.lastModified}`

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}

function sortPhotos(d: AssetCollectionDetail): AssetCollectionDetail {
  return { ...d, photos: [...(d.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order) }
}

function toSummary(d: AssetCollectionDetail | AssetCollection): AssetCollection {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { photos, ...rest } = d as AssetCollectionDetail
  return rest
}

const INPUT =
  'w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm ' +
  'placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors'
const BTN_PRIMARY =
  `flex items-center justify-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-50
   disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors ${FOCUS_RING}`
const BTN_SECONDARY =
  `flex items-center justify-center gap-2 px-3 py-2 bg-surface-elevated border border-portal-border hover:border-portal-accent/40
   disabled:opacity-50 disabled:cursor-not-allowed text-on-canvas rounded-lg text-sm transition-colors ${FOCUS_RING}`
const ICON_BTN =
  `w-7 h-7 rounded-md flex items-center justify-center bg-black/60 text-white hover:bg-black/80
   disabled:opacity-30 disabled:cursor-not-allowed ${FOCUS_RING}`

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title, body, confirmLabel, danger, busy, onConfirm, onCancel,
}: {
  title: string; body: string; confirmLabel: string; danger?: boolean; busy: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog labelledBy={titleId} describedBy={bodyId} onClose={onCancel} zClass="z-[80]" panelClassName="max-w-md" initialFocusRef={cancelRef}>
      <div className="p-6">
        <h3 id={titleId} className="text-on-canvas font-semibold text-base mb-2">{title}</h3>
        <p id={bodyId} className="text-on-canvas-subtle text-sm mb-5">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={danger
              ? `flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium ${FOCUS_RING}`
              : BTN_PRIMARY}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

interface Props {
  /** null = create a new collection. */
  initial: AssetCollectionDetail | null
  onSaved: (c: AssetCollection) => void
  onDeleted: (id: number) => void
  onClose: () => void
}

export default function CollectionEditorModal({ initial, onSaved, onDeleted, onClose }: Props) {
  const titleId = useId()
  const nameId = useId()
  const brandId = useId()
  const descId = useId()
  const scheduleId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [detail, setDetail] = useState<AssetCollectionDetail | null>(initial ? sortPhotos(initial) : null)
  const detailRef = useRef(detail)
  detailRef.current = detail

  // Details form
  const [name, setName] = useState(initial?.name ?? '')
  const [brandOpt, setBrandOpt] = useState(initial ? toBrandOpt(initial.brand) : 'Sliquid')
  const [customBrand, setCustomBrand] = useState(initial && toBrandOpt(initial.brand) === '__custom__' ? initial.brand : '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsSaved, setDetailsSaved] = useState(false)

  // Upload queue — kept in a ref so concurrent request callbacks see one truth.
  const queueRef = useRef<QItem[]>([])
  const inFlight = useRef(0)
  const mounted = useRef(true)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [dropActive, setDropActive] = useState(false)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)

  // Photo grid
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null)
  const [photoBusyId, setPhotoBusyId] = useState<number | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const orderTimer = useRef<number | null>(null)

  // Release
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleValue, setScheduleValue] = useState(toLocalInputValue(initial?.release_at))
  const [releaseBusy, setReleaseBusy] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [releaseNote, setReleaseNote] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'release' | 'unrelease' | null>(null)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (orderTimer.current) window.clearTimeout(orderTimer.current)
    }
  }, [])

  const brand = brandOpt === '__custom__' ? customBrand.trim() : brandOpt
  const isNew = !detail
  const detailsDirty = !!detail && (
    name.trim() !== detail.name || brand !== detail.brand || (description.trim() || null) !== (detail.description || null)
  )
  const photos = detail?.photos ?? []

  const queue = queueRef.current
  const qDone = queue.filter(q => q.status === 'done').length
  const qFailed = queue.filter(q => q.status === 'failed').length
  const qActive = queue.filter(q => q.status === 'queued' || q.status === 'uploading').length
  const uploading = qActive > 0

  function publish(next: AssetCollectionDetail | AssetCollection) {
    onSaved(toSummary(next))
  }

  async function refresh() {
    const id = detailRef.current?.id
    if (!id) return
    try {
      const fresh = sortPhotos(await api.get<AssetCollectionDetail>(`/collections/${id}`))
      if (!mounted.current) return
      setDetail(fresh)
      setScheduleValue(toLocalInputValue(fresh.release_at))
      publish(fresh)
    } catch (err) {
      console.error('[collections] refresh failed', err)
    }
  }

  // ── Details ──────────────────────────────────────────────────────────────

  async function saveDetails(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !brand) return
    setSavingDetails(true)
    setDetailsError(null)
    setDetailsSaved(false)
    const body = { name: name.trim(), brand, description: description.trim() || null }
    try {
      if (!detail) {
        const created = await api.post<AssetCollection>('/collections', body)
        const next: AssetCollectionDetail = { ...created, photos: [] }
        setDetail(next)
        publish(created)
      } else {
        const updated = await api.put<AssetCollection>(`/collections/${detail.id}`, body)
        setDetail(d => d ? { ...d, ...updated, photos: d.photos } : d)
        publish(updated)
        setDetailsSaved(true)
      }
    } catch (err) {
      setDetailsError(errMessage(err, 'Could not save the collection.'))
    } finally {
      setSavingDetails(false)
    }
  }

  // ── Upload queue ─────────────────────────────────────────────────────────

  function addFiles(list: FileList | File[]) {
    // Natural filename order (…-2 before …-10): that is the order the photos
    // are kept in, whatever order the parallel requests happen to finish.
    const files = Array.from(list).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    const skippedType: string[] = []
    const skippedHeic: string[] = []
    let skippedDup = 0
    const known = new Map(queueRef.current.map(q => [fingerprint(q.file), q]))
    for (const f of files) {
      // The server's sharp build cannot decode HEIC/HEIF (iPhone originals).
      if (/\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type)) { skippedHeic.push(f.name); continue }
      if (!f.type.startsWith('image/')) { skippedType.push(f.name); continue }
      const prior = known.get(fingerprint(f))
      if (prior) {
        if (prior.status === 'failed') { prior.status = 'queued'; prior.message = undefined }
        else skippedDup++
        continue
      }
      const item: QItem = { key: `${fingerprint(f)}|${Math.random().toString(36).slice(2)}`, file: f, status: 'queued' }
      queueRef.current.push(item)
      known.set(fingerprint(f), item)
    }
    const notes: string[] = []
    if (skippedType.length) {
      const shown = skippedType.slice(0, 5).join(', ')
      notes.push(`Skipped ${skippedType.length} non-image file${skippedType.length === 1 ? '' : 's'}: ${shown}${skippedType.length > 5 ? `, +${skippedType.length - 5} more` : ''}.`)
    }
    if (skippedHeic.length) {
      const shown = skippedHeic.slice(0, 5).join(', ')
      notes.push(`HEIC isn't supported — export as JPEG: ${shown}${skippedHeic.length > 5 ? `, +${skippedHeic.length - 5} more` : ''}.`)
    }
    if (skippedDup) notes.push(`Skipped ${skippedDup} file${skippedDup === 1 ? '' : 's'} already in the queue or uploaded.`)
    setSkippedNote(notes.length ? notes.join(' ') : null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    rerender()
    pump()
  }

  /**
   * Requests run in parallel, so the server numbers photos in completion order
   * (#1, #4, #5, #2…). Once the queue drains, put this session's uploads back in
   * filename order after the photos that were already there.
   */
  async function restoreFileOrder(id: number) {
    const uploaded = queueRef.current.filter(q => q.status === 'done' && q.photoId).map(q => q.photoId!)
    if (uploaded.length < 2) return
    const fresh = new Set(uploaded)
    const existing = (detailRef.current?.photos ?? []).map(p => p.id).filter(pid => !fresh.has(pid))
    try {
      await api.put(`/collections/${id}/order`, { photo_ids: [...existing, ...uploaded] })
    } catch (err) {
      console.error('[collections] could not restore upload order', err)
    }
  }

  function pump() {
    const id = detailRef.current?.id
    if (!id) return
    while (inFlight.current < REQUESTS_IN_FLIGHT) {
      const batch = queueRef.current.filter(q => q.status === 'queued').slice(0, FILES_PER_REQUEST)
      if (batch.length === 0) break
      batch.forEach(q => { q.status = 'uploading'; q.message = undefined })
      inFlight.current++
      sendBatch(id, batch).finally(() => {
        inFlight.current--
        if (!mounted.current) return
        rerender()
        const more = queueRef.current.some(q => q.status === 'queued')
        if (more) pump()
        else if (inFlight.current === 0) void restoreFileOrder(id).then(refresh)  // queue drained
      })
    }
    rerender()
  }

  async function sendBatch(id: number, batch: QItem[]) {
    const form = new FormData()
    batch.forEach(q => form.append('files', q.file, q.file.name))
    try {
      const res = await api.postForm<CollectionUploadResult>(`/collections/${id}/photos`, form)
      const errors = [...(res.errors ?? [])]
      const added: CollectionPhoto[] = res.photos ?? []
      // The server returns the successful files' photos in request order.
      let next = 0
      for (const q of batch) {
        const i = errors.findIndex(e => e.file === q.file.name)
        if (i !== -1) { q.status = 'failed'; q.message = errors[i].message || 'Upload failed'; errors.splice(i, 1) }
        else { q.status = 'done'; q.photoId = added[next++]?.id }
      }
      if (added.length && mounted.current) {
        setDetail(d => {
          if (!d) return d
          const fresh = added.filter(a => !d.photos.some(p => p.id === a.id))
          return { ...d, photos: [...d.photos, ...fresh], photo_count: d.photos.length + fresh.length }
        })
      }
    } catch (err) {
      const message = errMessage(err, 'Upload failed')
      // A 400 where every file was rejected still carries per-file reasons.
      const perFile = ((err as { body?: { errors?: { file: string; message: string }[] } })?.body?.errors) ?? []
      batch.forEach(q => {
        q.status = 'failed'
        q.message = perFile.find(e => e.file === q.file.name)?.message || message
      })
      // Storage not configured (503) fails every request the same way — stop
      // instead of burning through the rest of the queue.
      const status = (err as { status?: number })?.status
      if (status === 503 || /not configured/i.test(message)) {
        queueRef.current.forEach(q => { if (q.status === 'queued') { q.status = 'failed'; q.message = message } })
      }
    }
  }

  function retryFailed() {
    queueRef.current.forEach(q => { if (q.status === 'failed') { q.status = 'queued'; q.message = undefined } })
    pump()
  }

  function cancelRemaining() {
    queueRef.current.forEach(q => { if (q.status === 'queued') { q.status = 'failed'; q.message = 'Cancelled' } })
    rerender()
  }

  function clearFinished() {
    queueRef.current = queueRef.current.filter(q => q.status !== 'done')
    rerender()
  }

  // ── Photos ───────────────────────────────────────────────────────────────

  const effectiveCoverId = detail?.cover_asset_id ?? photos[0]?.id ?? null

  async function setCover(photo: CollectionPhoto) {
    if (!detail) return
    setPhotoBusyId(photo.id)
    setPhotoError(null)
    try {
      const updated = await api.put<AssetCollection>(`/collections/${detail.id}`, { cover_asset_id: photo.id })
      setDetail(d => d ? { ...d, ...updated, photos: d.photos } : d)
      publish(updated)
    } catch (err) {
      setPhotoError(errMessage(err, 'Could not set the cover.'))
    } finally {
      setPhotoBusyId(null)
    }
  }

  async function removePhoto(photo: CollectionPhoto) {
    if (confirmRemoveId !== photo.id) { setConfirmRemoveId(photo.id); return }
    setPhotoBusyId(photo.id)
    setPhotoError(null)
    try {
      await api.delete(`/assets/${photo.id}`)
      setDetail(d => d ? { ...d, photos: d.photos.filter(p => p.id !== photo.id), photo_count: d.photos.length - 1 } : d)
      setConfirmRemoveId(null)
      void refresh()
    } catch (err) {
      setPhotoError(errMessage(err, 'Could not remove the photo.'))
    } finally {
      setPhotoBusyId(null)
    }
  }

  function move(index: number, delta: -1 | 1) {
    if (!detail) return
    const target = index + delta
    if (target < 0 || target >= photos.length) return
    const next = [...photos]
    ;[next[index], next[target]] = [next[target], next[index]]
    const ordered = next.map((p, i) => ({ ...p, sort_order: i }))
    setDetail({ ...detail, photos: ordered })
    // Debounced so moving one photo ten places is one request, not ten.
    if (orderTimer.current) window.clearTimeout(orderTimer.current)
    const id = detail.id
    orderTimer.current = window.setTimeout(async () => {
      orderTimer.current = null
      try {
        await api.put(`/collections/${id}/order`, { photo_ids: (detailRef.current?.photos ?? ordered).map(p => p.id) })
        void refresh()
      } catch (err) {
        setPhotoError(errMessage(err, 'Could not save the new order.'))
        void refresh()
      }
    }, 500)
  }

  // ── Release ──────────────────────────────────────────────────────────────

  async function runRelease(kind: 'release' | 'unrelease') {
    if (!detail) return
    setReleaseBusy(true)
    setReleaseError(null)
    setReleaseNote(null)
    try {
      const res = await api.post<AssetCollection & { notified?: boolean; message?: string }>(`/collections/${detail.id}/${kind}`, {})
      setReleaseNote(res?.message || (kind === 'release' ? 'Released.' : 'Unpublished — back to draft.'))
      setConfirm(null)
      setScheduleOpen(false)
      await refresh()
    } catch (err) {
      setReleaseError(errMessage(err, kind === 'release' ? 'Could not release the collection.' : 'Could not unpublish the collection.'))
      setConfirm(null)
    } finally {
      setReleaseBusy(false)
    }
  }

  async function saveSchedule(releaseAt: string | null) {
    if (!detail) return
    if (releaseAt && new Date(releaseAt).getTime() <= Date.now()) {
      setReleaseError('Pick a time in the future, or use Release now.')
      return
    }
    setReleaseBusy(true)
    setReleaseError(null)
    try {
      await api.put(`/collections/${detail.id}/schedule`, { release_at: releaseAt })
      setScheduleOpen(false)
      await refresh()
    } catch (err) {
      setReleaseError(errMessage(err, 'Could not save the schedule.'))
    } finally {
      setReleaseBusy(false)
    }
  }

  // ── Delete / close ───────────────────────────────────────────────────────

  async function deleteCollection() {
    if (!detail) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/collections/${detail.id}`)
      queueRef.current.forEach(q => { if (q.status === 'queued') q.status = 'failed' })
      onDeleted(detail.id)
      onClose()
    } catch (err) {
      setDeleteError(errMessage(err, 'Could not delete the collection.'))
      setDeleting(false)
    }
  }

  function requestClose() {
    if (uploading) {
      const ok = window.confirm('Uploads are still running. Close and cancel the files that have not started yet?')
      if (!ok) return
      cancelRemaining()
    }
    onClose()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const progressPct = queue.length ? Math.round((qDone / queue.length) * 100) : 0
  const canRelease = !!detail && photos.length > 0 && !uploading

  return (
    <>
      <Dialog
        labelledBy={titleId}
        onClose={requestClose}
        zClass="z-[60]"
        panelClassName="max-w-4xl overflow-hidden"
        closeOnBackdrop={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-portal-border flex-shrink-0">
          <h2 id={titleId} className="text-on-canvas text-lg font-semibold truncate">
            {!detail ? 'New collection' : `Edit collection — ${detail.name}`}
          </h2>
          <button type="button" onClick={requestClose} aria-label="Close" className={`p-2 rounded-lg text-on-canvas-muted hover:text-on-canvas ${FOCUS_RING}`}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* ── Details ── */}
          <form onSubmit={saveDetails} className="space-y-4" aria-labelledby={`${titleId}-details`}>
            <h3 id={`${titleId}-details`} className="text-on-canvas text-sm font-semibold">
              {isNew ? 'Step 1 — Details' : 'Details'}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={nameId} className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Name</label>
                <input
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setDetailsSaved(false) }}
                  required
                  maxLength={200}
                  placeholder="e.g. Fall 2026 Launch"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor={brandId} className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Brand</label>
                <BrandSelect
                  id={brandId}
                  value={brandOpt}
                  customValue={customBrand}
                  onChangeValue={v => { setBrandOpt(v); setDetailsSaved(false) }}
                  onChangeCustom={v => { setCustomBrand(v); setDetailsSaved(false) }}
                  datalistId="brand-options-collection"
                />
              </div>
            </div>
            <div>
              <label htmlFor={descId} className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Description <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <textarea
                id={descId}
                value={description}
                onChange={e => { setDescription(e.target.value); setDetailsSaved(false) }}
                rows={3}
                maxLength={2000}
                className={`${INPUT} resize-y`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingDetails || !name.trim() || !brand || (!isNew && !detailsDirty)}
                className={BTN_PRIMARY}
              >
                {savingDetails ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                {isNew ? 'Create collection' : 'Save details'}
              </button>
              <span role="status" aria-live="polite" className="text-xs">
                {detailsError && <span className="text-red-500">{detailsError}</span>}
                {detailsSaved && !detailsError && <span className="text-emerald-600 dark:text-emerald-400">Saved.</span>}
              </span>
            </div>
          </form>

          {!detail ? (
            <p className="text-on-canvas-muted text-sm border border-dashed border-portal-border rounded-xl px-4 py-6 text-center">
              Create the collection first, then add photos. It stays a hidden draft until you release it.
            </p>
          ) : (
            <>
              {/* ── Photos ── */}
              <section aria-labelledby={`${titleId}-photos`} className="space-y-3">
                <h3 id={`${titleId}-photos`} className="text-on-canvas text-sm font-semibold">
                  Photos <span className="text-on-canvas-muted font-normal">({photos.length})</span>
                </h3>

                <div
                  onDragOver={e => { e.preventDefault(); setDropActive(true) }}
                  onDragLeave={() => setDropActive(false)}
                  onDrop={e => { e.preventDefault(); setDropActive(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files) }}
                  className={`border-2 border-dashed rounded-xl px-4 py-8 flex flex-col items-center justify-center gap-3 text-center transition-colors
                    ${dropActive ? 'border-portal-accent bg-portal-accent/5' : 'border-portal-border'}`}
                >
                  <Upload className="w-8 h-8 text-on-canvas-muted opacity-60" aria-hidden="true" />
                  <p className="text-on-canvas text-sm">Drop photos here — 50+ at once is fine</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={BTN_SECONDARY}>
                    Choose files…
                  </button>
                  <p className="text-on-canvas-muted text-xs">Images only (JPEG, PNG, WebP…; not HEIC). Uploaded {FILES_PER_REQUEST} at a time.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Choose photos to upload"
                    onChange={e => e.target.files && addFiles(e.target.files)}
                  />
                </div>

                {skippedNote && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span className="break-words">{skippedNote}</span>
                  </p>
                )}

                {/* Queue */}
                {queue.length > 0 && (
                  <div className="border border-portal-border rounded-xl p-3 space-y-3">
                    <div role="status" aria-live="polite" className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-on-canvas font-medium">
                          {qDone} of {queue.length} uploaded
                          {qFailed > 0 && <span className="text-red-500"> · {qFailed} failed</span>}
                        </span>
                        {uploading && <span className="text-on-canvas-muted flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Uploading…</span>}
                      </div>
                      <div className="h-2 rounded-full bg-portal-bg overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-portal-accent transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {qFailed > 0 && (
                        <button type="button" onClick={retryFailed} className={BTN_SECONDARY}>
                          <RotateCcw className="w-4 h-4" aria-hidden="true" /> Retry failed ({qFailed})
                        </button>
                      )}
                      {queue.some(q => q.status === 'queued') && (
                        <button type="button" onClick={cancelRemaining} className={BTN_SECONDARY}>
                          <Ban className="w-4 h-4" aria-hidden="true" /> Cancel remaining
                        </button>
                      )}
                      {qDone > 0 && !uploading && (
                        <button type="button" onClick={clearFinished} className={BTN_SECONDARY}>Clear finished</button>
                      )}
                    </div>
                    <ul className="max-h-56 overflow-y-auto divide-y divide-portal-border text-xs" aria-label="Upload queue">
                      {queue.map(q => (
                        <li key={q.key} className="flex items-start justify-between gap-3 py-1.5">
                          <span className="text-on-canvas break-all min-w-0">{q.file.name}</span>
                          <span className={`flex-shrink-0 text-right ${
                            q.status === 'done' ? 'text-emerald-600 dark:text-emerald-400'
                            : q.status === 'failed' ? 'text-red-500'
                            : 'text-on-canvas-muted'}`}
                          >
                            {q.status === 'queued' && 'Queued'}
                            {q.status === 'uploading' && 'Uploading…'}
                            {q.status === 'done' && 'Done'}
                            {q.status === 'failed' && `Failed${q.message ? ` — ${q.message}` : ''}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {photoError && <p role="alert" className="text-xs text-red-500">{photoError}</p>}

                {/* Uploaded photos */}
                {photos.length === 0 ? (
                  <p className="text-on-canvas-muted text-sm flex items-center gap-2">
                    <Images className="w-4 h-4" aria-hidden="true" /> No photos yet.
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((p, i) => {
                      const isCover = p.id === effectiveCoverId
                      const confirming = confirmRemoveId === p.id
                      const busy = photoBusyId === p.id
                      return (
                        <li key={p.id} className="bg-portal-bg border border-portal-border rounded-xl overflow-hidden">
                          <div className="relative aspect-square">
                            <img src={p.thumbnail_url || p.file_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                            {isCover && (
                              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-semibold">Cover</span>
                            )}
                            {busy && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" aria-hidden="true" />
                              </div>
                            )}
                            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
                              <div className="flex gap-1">
                                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} earlier`} className={ICON_BTN}>
                                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label={`Move ${p.name} later`} className={ICON_BTN}>
                                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setCover(p)}
                                disabled={busy || isCover}
                                aria-pressed={isCover}
                                aria-label={isCover ? `${p.name} is the cover` : `Set ${p.name} as cover`}
                                className={ICON_BTN}
                              >
                                <Star className={`w-4 h-4 ${isCover ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                            <span className="text-on-canvas text-[11px] truncate min-w-0" title={p.name}>{p.name}</span>
                            {confirming ? (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => removePhoto(p)}
                                  disabled={busy}
                                  className={`px-1.5 py-0.5 rounded bg-red-600 text-white text-[11px] font-medium ${FOCUS_RING}`}
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveId(null)}
                                  aria-label="Keep photo"
                                  className={`p-0.5 rounded text-on-canvas-muted hover:text-on-canvas ${FOCUS_RING}`}
                                >
                                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => removePhoto(p)}
                                aria-label={`Remove ${p.name}`}
                                className={`p-1 rounded text-on-canvas-muted hover:text-red-500 flex-shrink-0 ${FOCUS_RING}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* ── Release ── */}
              <section aria-labelledby={`${titleId}-release`} className="border border-portal-border rounded-xl p-4 space-y-3">
                <h3 id={`${titleId}-release`} className="text-on-canvas text-sm font-semibold">Release</h3>
                <p className="text-sm text-on-canvas-subtle flex items-start gap-2">
                  {detail.status === 'released' ? (
                    <><CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
                      <span>Released {formatDateTime(detail.released_at)} — visible to partners.</span></>
                  ) : detail.status === 'scheduled' ? (
                    <><CalendarClock className="w-4 h-4 mt-0.5 text-sky-600 dark:text-sky-400 flex-shrink-0" aria-hidden="true" />
                      <span>Scheduled — partners will see it {formatDateTime(detail.release_at)} ({timeUntil(detail.release_at)}). Hidden until then.</span></>
                  ) : (
                    <><EyeOff className="w-4 h-4 mt-0.5 text-on-canvas-muted flex-shrink-0" aria-hidden="true" />
                      <span>Draft — hidden from partners.</span></>
                  )}
                </p>

                {detail.status !== 'released' && photos.length === 0 && (
                  <p className="text-xs text-on-canvas-muted">Add at least one photo before releasing or scheduling.</p>
                )}
                {detail.status !== 'released' && uploading && photos.length > 0 && (
                  <p className="text-xs text-on-canvas-muted">Wait for the uploads to finish before releasing.</p>
                )}

                {detail.status === 'released' ? (
                  <button type="button" onClick={() => setConfirm('unrelease')} disabled={releaseBusy} className={BTN_SECONDARY}>
                    <EyeOff className="w-4 h-4" aria-hidden="true" /> Unpublish
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setConfirm('release')} disabled={!canRelease || releaseBusy} className={BTN_PRIMARY}>
                      <Send className="w-4 h-4" aria-hidden="true" /> Release now
                    </button>
                    <button
                      type="button"
                      onClick={() => { setScheduleOpen(o => !o); setReleaseError(null) }}
                      disabled={!canRelease || releaseBusy}
                      aria-expanded={scheduleOpen}
                      className={BTN_SECONDARY}
                    >
                      <CalendarClock className="w-4 h-4" aria-hidden="true" />
                      {detail.status === 'scheduled' ? 'Change schedule…' : 'Schedule…'}
                    </button>
                    {detail.status === 'scheduled' && (
                      <button type="button" onClick={() => saveSchedule(null)} disabled={releaseBusy} className={BTN_SECONDARY}>
                        <Ban className="w-4 h-4" aria-hidden="true" /> Cancel schedule
                      </button>
                    )}
                  </div>
                )}

                {scheduleOpen && detail.status !== 'released' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor={scheduleId} className="block text-on-canvas-subtle text-xs font-medium mb-1">
                        Release at (your local time)
                      </label>
                      <input
                        id={scheduleId}
                        type="datetime-local"
                        value={scheduleValue}
                        min={toLocalInputValue(new Date().toISOString())}
                        onChange={e => setScheduleValue(e.target.value)}
                        className={`${INPUT} w-auto`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => saveSchedule(fromLocalInputValue(scheduleValue))}
                      disabled={!scheduleValue || releaseBusy}
                      className={BTN_PRIMARY}
                    >
                      {releaseBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                      Save schedule
                    </button>
                  </div>
                )}

                <div role="status" aria-live="polite" className="text-xs">
                  {releaseError && <span className="text-red-500">{releaseError}</span>}
                  {!releaseError && releaseNote && <span className="text-emerald-600 dark:text-emerald-400">{releaseNote}</span>}
                </div>
              </section>

              {/* ── Delete ── */}
              <section className="border border-red-500/30 rounded-xl p-4 space-y-2">
                <h3 className="text-on-canvas text-sm font-semibold">Delete collection</h3>
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-sm text-on-canvas-subtle">
                      This permanently deletes the collection and all {photos.length} photo{photos.length === 1 ? '' : 's'} in it. This cannot be undone.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={deleteCollection}
                        disabled={deleting}
                        className={`flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium ${FOCUS_RING}`}
                      >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
                        Delete collection and {photos.length} photo{photos.length === 1 ? '' : 's'}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className={BTN_SECONDARY}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className={BTN_SECONDARY}>
                    <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" /> Delete collection…
                  </button>
                )}
                {deleteError && <p role="alert" className="text-xs text-red-500">{deleteError}</p>}
              </section>
            </>
          )}
        </div>
      </Dialog>

      {confirm === 'release' && detail && (
        <ConfirmDialog
          title={`Release “${detail.name}” now?`}
          body="Partners will see this collection and get one notification in the portal and by email."
          confirmLabel="Release now"
          busy={releaseBusy}
          onConfirm={() => runRelease('release')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'unrelease' && detail && (
        <ConfirmDialog
          title={`Unpublish “${detail.name}”?`}
          body="Partners will no longer see this collection; it goes back to a hidden draft. Releasing it again later will not send another notification."
          confirmLabel="Unpublish"
          danger
          busy={releaseBusy}
          onConfirm={() => runRelease('unrelease')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}

