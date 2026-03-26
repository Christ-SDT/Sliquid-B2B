import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin as checkAdmin } from '@/types'
import {
  Image as ImageIcon, Upload, Copy, Check, Pencil, Trash2, X, ExternalLink,
  Search, Loader2, AlertCircle, Save, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = 'asset' | 'creative' | 'marketing' | 'ai' | 'media'

interface MediaItem {
  id: number
  _source: Source
  label: string | null
  brand: string | null
  type: string | null
  file_url: string
  thumbnail_url: string | null
  file_size: string | null
  dimensions: string | null
  s3_key: string
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
  // optional per-source fields
  subtitle?: string | null
  description?: string | null
  campaign?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANDS = ['Sliquid', 'RIDE', 'Creator Creations', 'Other']

const ASSET_TYPES = [
  'Logo', 'Banner', 'Social', 'Social Media', 'Document', 'Print',
  'Email', 'Multi', 'Video', 'Other',
]

const BRAND_FILTERS = ['all', 'Sliquid', 'Ride Lube', 'Creator Creations', 'Other'] as const
const SOURCE_FILTERS: Source[] = ['asset', 'creative', 'marketing', 'ai', 'media']
const SOURCE_LABELS: Record<string, string> = {
  asset: 'Assets', creative: 'Creatives', marketing: 'Marketing', ai: 'AI', media: 'Media',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeBrand(brand: string | null): string {
  if (!brand) return 'Other'
  const b = brand.toUpperCase()
  if (b === 'RIDE' || brand.toLowerCase().includes('ride lube')) return 'Ride Lube'
  if (brand.toLowerCase().includes('creator')) return 'Creator Creations'
  return brand
}

function brandPillClass(brand: string | null): string {
  const b = normalizeBrand(brand)
  if (b === 'Ride Lube') return 'bg-teal-500/20 text-teal-300 border-teal-500/30'
  if (b === 'Creator Creations') return 'bg-violet-500/20 text-violet-300 border-violet-500/30'
  if (b === 'Sliquid') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
}

function sourcePillClass(source: Source): string {
  switch (source) {
    case 'asset':     return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    case 'creative':  return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    case 'marketing': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    case 'ai':        return 'bg-violet-500/20 text-violet-300 border-violet-500/30'
    case 'media':     return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
  }
}

function sourceLabel(source: Source): string {
  return SOURCE_LABELS[source] ?? source
}

function formatDate(dt: string): string {
  try { return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return dt }
}

// ─── Shared form field components ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-on-canvas-muted text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent'
const selectCls = inputCls

// ─── Per-source EditForm ───────────────────────────────────────────────────────

type EditState = {
  name: string       // label / name / title
  brand: string
  type: string
  file_url: string
  thumbnail_url: string
  file_size: string
  dimensions: string
  description: string
  subtitle: string
  campaign: string
}

function buildEditState(item: MediaItem): EditState {
  return {
    name:          item.label ?? '',
    brand:         item.brand ?? 'Sliquid',
    type:          item.type ?? '',
    file_url:      item.file_url ?? '',
    thumbnail_url: item.thumbnail_url ?? '',
    file_size:     item.file_size ?? '',
    dimensions:    item.dimensions ?? '',
    description:   item.description ?? '',
    subtitle:      item.subtitle ?? '',
    campaign:      item.campaign ?? '',
  }
}

function EditForm({
  item,
  state,
  setState,
}: {
  item: MediaItem
  state: EditState
  setState: React.Dispatch<React.SetStateAction<EditState>>
}) {
  function set(key: keyof EditState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setState(prev => ({ ...prev, [key]: e.target.value }))
  }

  if (item._source === 'ai') {
    return (
      <p className="text-on-canvas-muted text-sm italic py-2">
        AI-generated images cannot be edited — the prompt is fixed. You can delete this image below.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Name / Label */}
      <Field label={item._source === 'creative' ? 'Title' : 'Name / Label'}>
        <input value={state.name} onChange={set('name')} placeholder="Display name" className={inputCls} />
      </Field>

      {/* Brand — not shown for marketing (always Sliquid) */}
      {item._source !== 'marketing' && (
        <Field label="Brand">
          <select value={state.brand} onChange={set('brand')} className={selectCls}>
            {BRANDS.map(b => <option key={b} value={b}>{b === 'RIDE' ? 'Ride Lube' : b}</option>)}
          </select>
        </Field>
      )}

      {/* Type — asset and creative only */}
      {(item._source === 'asset' || item._source === 'creative') && (
        <Field label="Section / Type">
          <select value={state.type} onChange={set('type')} className={selectCls}>
            <option value="">— select type —</option>
            {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      )}

      {/* File URL — asset and creative */}
      {(item._source === 'asset' || item._source === 'creative') && (
        <Field label="File URL">
          <input value={state.file_url} onChange={set('file_url')} placeholder="https://…" className={inputCls} />
        </Field>
      )}

      {/* Thumbnail URL — asset and creative */}
      {(item._source === 'asset' || item._source === 'creative') && (
        <Field label="Thumbnail URL (optional — defaults to file URL)">
          <input value={state.thumbnail_url} onChange={set('thumbnail_url')} placeholder="https://… (leave blank to use file URL)" className={inputCls} />
        </Field>
      )}

      {/* File size + dimensions row — asset and creative */}
      {(item._source === 'asset' || item._source === 'creative') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="File Size">
            <input value={state.file_size} onChange={set('file_size')} placeholder="e.g. 240 KB" className={inputCls} />
          </Field>
          <Field label="Dimensions">
            <input value={state.dimensions} onChange={set('dimensions')} placeholder="e.g. 1920×1080" className={inputCls} />
          </Field>
        </div>
      )}

      {/* Description — creative and marketing */}
      {(item._source === 'creative' || item._source === 'marketing') && (
        <Field label="Description">
          <textarea value={state.description} onChange={set('description')} rows={2} placeholder="Optional description" className={inputCls} />
        </Field>
      )}

      {/* Subtitle — marketing only */}
      {item._source === 'marketing' && (
        <Field label="Subtitle">
          <input value={state.subtitle} onChange={set('subtitle')} placeholder="Short subtitle" className={inputCls} />
        </Field>
      )}

      {/* Campaign — creative only */}
      {item._source === 'creative' && (
        <Field label="Campaign">
          <input value={state.campaign} onChange={set('campaign')} placeholder="Campaign name (optional)" className={inputCls} />
        </Field>
      )}
    </div>
  )
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      title="Copy URL"
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
        copied
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-portal-accent/50',
        className,
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy URL'}
    </button>
  )
}

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({
  item,
  onClose,
  onDeleted,
  onUpdated,
}: {
  item: MediaItem
  onClose: () => void
  onDeleted: (source: Source, id: number) => void
  onUpdated: (item: MediaItem) => void
}) {
  const [tab, setTab] = useState<'info' | 'edit'>('info')
  const [editState, setEditState] = useState<EditState>(() => buildEditState(item))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Reset edit state if item changes (e.g. after save)
  useEffect(() => { setEditState(buildEditState(item)) }, [item.id])

  const canEdit = item._source !== 'ai'

  function buildPayload(): Record<string, unknown> {
    const s = editState
    if (item._source === 'asset') {
      return { name: s.name, brand: s.brand, type: s.type, file_url: s.file_url, thumbnail_url: s.thumbnail_url || null, file_size: s.file_size || null, dimensions: s.dimensions || null }
    }
    if (item._source === 'creative') {
      return { name: s.name, brand: s.brand, type: s.type, file_url: s.file_url, thumbnail_url: s.thumbnail_url || null, description: s.description || null, campaign: s.campaign || null, file_size: s.file_size || null, dimensions: s.dimensions || null }
    }
    if (item._source === 'marketing') {
      return { name: s.name, subtitle: s.subtitle || null, description: s.description || null }
    }
    // media
    return { label: s.name, brand: s.brand }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const updated = await api.put<MediaItem>(
        `/media/item/${item._source}/${item.id}`,
        buildPayload(),
      )
      onUpdated({ ...item, ...updated })
      setTab('info')
    } catch (err: any) {
      setSaveError(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/media/item/${item._source}/${item.id}`)
      onDeleted(item._source, item.id)
      onClose()
    } catch (err: any) {
      alert(err.message ?? 'Delete failed')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const displayName = item.label || item.s3_key.split('/').pop() || 'Untitled'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0', sourcePillClass(item._source))}>
              {sourceLabel(item._source)}
            </span>
            <h2 className="text-on-canvas font-semibold text-sm truncate">{displayName}</h2>
          </div>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-portal-border flex-shrink-0">
          {['info', canEdit ? 'edit' : null].filter(Boolean).map(t => (
            <button
              key={t!}
              onClick={() => { setTab(t as 'info' | 'edit'); setSaveError('') }}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-portal-accent text-portal-accent'
                  : 'border-transparent text-on-canvas-subtle hover:text-on-canvas',
              )}
            >
              {t === 'info' ? 'Info' : 'Edit'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === 'info' ? (
            <>
              {/* Image preview */}
              <div className="bg-portal-bg flex items-center justify-center" style={{ maxHeight: 280 }}>
                <img
                  src={item.file_url}
                  alt={displayName}
                  className="max-w-full max-h-64 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>

              <div className="p-5 space-y-4">
                {/* File URL — primary action */}
                <div>
                  <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-1.5">File URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-on-canvas-subtle bg-portal-bg rounded-md px-3 py-2 font-mono truncate border border-portal-border">
                      {item.file_url}
                    </code>
                    <CopyButton text={item.file_url} />
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-on-canvas-muted hover:text-portal-accent transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {([
                    { label: 'Brand', value: <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', brandPillClass(item.brand))}>{normalizeBrand(item.brand)}</span> },
                    item.type ? { label: 'Type', value: item.type } : null,
                    { label: 'Added', value: formatDate(item.created_at) },
                    item.file_size ? { label: 'Size', value: item.file_size } : null,
                    item.dimensions ? { label: 'Dimensions', value: item.dimensions } : null,
                    item.mime_type ? { label: 'Format', value: item.mime_type.split('/')[1]?.toUpperCase() ?? item.mime_type } : null,
                    item.uploaded_by ? { label: 'By', value: item.uploaded_by } : null,
                    item.subtitle ? { label: 'Subtitle', value: item.subtitle } : null,
                    item.description ? { label: 'Description', value: item.description } : null,
                    item.campaign ? { label: 'Campaign', value: item.campaign } : null,
                  ] as const).filter(Boolean).map((m, i) => (
                    <div key={i} className="bg-portal-bg rounded-lg p-2.5 border border-portal-border">
                      <p className="text-on-canvas-muted text-[10px] font-medium uppercase tracking-wider mb-0.5">{m!.label}</p>
                      <p className="text-on-canvas text-sm break-words">{m!.value}</p>
                    </div>
                  ))}
                </div>

                {/* Delete zone */}
                <div className="border-t border-portal-border pt-4">
                  <p className="text-on-canvas-muted text-xs mb-3">
                    Deleting removes this file from the {sourceLabel(item._source)} library and from S3 storage permanently.
                  </p>
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Yes, delete permanently
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 text-sm text-on-canvas-muted hover:text-on-canvas border border-portal-border rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/40 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete this file
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ── Edit tab ── */
            <div className="p-5 space-y-4">
              <EditForm item={item} state={editState} setState={setEditState} />

              {saveError && (
                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving || item._source === 'ai'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setEditState(buildEditState(item)); setTab('info'); setSaveError('') }}
                  className="px-4 py-2 bg-surface-elevated border border-portal-border rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onUploaded,
  onBulkUploaded,
}: {
  onClose: () => void
  onUploaded: (item: MediaItem) => void
  onBulkUploaded?: (items: MediaItem[]) => void
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [brand, setBrand] = useState('Sliquid')
  const [notify, setNotify] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isBulk = selectedFiles.length > 1

  useEffect(() => {
    return () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl) }
  }, [filePreviewUrl])

  function handleFilesSelect(files: File[]) {
    if (!files.length) return
    setSelectedFiles(files)
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    const first = files[0]
    setFilePreviewUrl(first.type.startsWith('image/') ? URL.createObjectURL(first) : null)
    // Auto-fill label only for single file
    if (files.length === 1 && !label) {
      const base = first.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
      setLabel(base.charAt(0).toUpperCase() + base.slice(1))
    }
  }

  function clearFiles() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    setSelectedFiles([])
    setFilePreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFiles.length) { setError('Please select a file'); return }
    setUploading(true)
    setError('')
    try {
      if (isBulk) {
        const fd = new FormData()
        selectedFiles.forEach(f => fd.append('files', f))
        fd.append('brand', brand)
        if (notify) fd.append('notify', 'true')
        const result = await api.postForm<{ items: MediaItem[]; count: number; errors?: string[] }>('/media/bulk-upload', fd)
        if (result.errors?.length) setError(`${result.count} uploaded. Failed: ${result.errors.join('; ')}`)
        if (onBulkUploaded) onBulkUploaded(result.items)
        if (!result.errors?.length) onClose()
      } else {
        const fd = new FormData()
        fd.append('file', selectedFiles[0])
        fd.append('label', label)
        fd.append('brand', brand)
        if (notify) fd.append('notify', 'true')
        const result = await api.postForm<MediaItem>('/media/upload', fd)
        onUploaded(result)
        onClose()
      }
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold text-base">
            Upload {isBulk ? `${selectedFiles.length} Files` : 'Image'}
          </h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); if (files.length) handleFilesSelect(files) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              selectedFiles.length > 0 ? 'border-portal-accent bg-portal-accent/5' : 'border-portal-border hover:border-portal-accent/50'
            }`}
          >
            {filePreviewUrl && !isBulk
              ? <img src={filePreviewUrl} className="max-h-32 mx-auto rounded-lg object-contain mb-2" alt="preview" />
              : <Upload className="w-8 h-8 text-on-canvas-muted mx-auto mb-2" />
            }
            <p className="text-on-canvas-subtle text-sm">
              {selectedFiles.length > 0
                ? isBulk
                  ? `${selectedFiles.length} files selected`
                  : selectedFiles[0].name
                : 'Drag & drop or click to select'
              }
            </p>
            {selectedFiles.length === 0
              ? <p className="text-on-canvas-muted text-xs mt-1">Max 750 MB · Select multiple files for bulk upload</p>
              : isBulk
                ? <p className="text-on-canvas-muted text-xs mt-1 truncate">{selectedFiles[0].name}{selectedFiles.length > 1 ? ` + ${selectedFiles.length - 1} more` : ''}</p>
                : null
            }
            {selectedFiles.length > 0 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); clearFiles() }}
                className="mt-2 text-xs text-on-canvas-muted hover:text-red-400 transition-colors"
              >
                Clear selection
              </button>
            )}
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden"
              onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesSelect(files) }} />
          </div>

          {/* Label — only shown for single file */}
          {!isBulk && (
            <Field label="Label (optional)">
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Descriptive name" className={inputCls} />
            </Field>
          )}

          <Field label="Brand">
            <select value={brand} onChange={e => setBrand(e.target.value)} className={selectCls}>
              {BRANDS.map(b => <option key={b} value={b}>{b === 'RIDE' ? 'Ride Lube' : b}</option>)}
            </select>
          </Field>

          {/* Notify checkbox */}
          <label className="flex items-center gap-2 text-sm text-on-canvas-subtle cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notify}
              onChange={e => setNotify(e.target.checked)}
              className="rounded border-portal-border"
            />
            Notify all users about this upload
          </label>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={uploading || selectedFiles.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 disabled:opacity-50 disabled:cursor-not-allowed">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : isBulk ? `Upload ${selectedFiles.length} Files` : 'Upload'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 bg-surface-elevated border border-portal-border rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MediaCard ────────────────────────────────────────────────────────────────

function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  function copyUrl(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(item.file_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      className="relative aspect-square rounded-xl overflow-hidden bg-portal-bg border border-portal-border cursor-pointer group"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={item.thumbnail_url || item.file_url}
        alt={item.label ?? ''}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
        onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }}
      />

      {hovered && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
          <button onClick={copyUrl} title="Copy URL"
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={e => { e.stopPropagation(); onClick() }} title="Edit / details"
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none', brandPillClass(item.brand))}>
          {normalizeBrand(item.brand)}
        </span>
      </div>
      <div className="absolute bottom-1.5 right-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none', sourcePillClass(item._source))}>
          {sourceLabel(item._source)}
        </span>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const isAdmin = user ? checkAdmin(user.role) : false

  const load = useCallback(() => {
    setLoading(true)
    api.get<MediaItem[]>('/media')
      .then(data => { setItems(data); setLoading(false) })
      .catch(err => { setError(err.message ?? 'Failed to load'); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(item => {
    if (brandFilter !== 'all') {
      const nb = normalizeBrand(item.brand)
      if (brandFilter === 'Other' ? nb !== 'Other' : nb !== brandFilter) return false
    }
    if (sourceFilter !== 'all' && item._source !== sourceFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(item.label ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function handleDeleted(source: Source, id: number) {
    setItems(prev => prev.filter(i => !(i._source === source && i.id === id)))
  }

  function handleUpdated(updated: MediaItem) {
    setItems(prev => prev.map(i => (i._source === updated._source && i.id === updated.id) ? updated : i))
    setSelectedItem(updated)
  }

  return (
    <div className="min-h-full bg-portal-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-portal-accent/10 border border-portal-accent/20 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-portal-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-on-canvas">Media Library</h1>
              <p className="text-on-canvas-muted text-sm">{items.length} files across all sources</p>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 transition-colors">
              <Upload className="w-4 h-4" />
              Upload
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-surface border border-portal-border rounded-xl p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg pl-9 pr-3 py-2 text-sm text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-on-canvas-muted text-xs whitespace-nowrap">Brand:</span>
            {BRAND_FILTERS.map(b => (
              <button key={b} onClick={() => setBrandFilter(b)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  brandFilter === b
                    ? 'bg-portal-accent border-portal-accent text-white'
                    : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas')}>
                {b === 'all' ? 'All' : b}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-on-canvas-muted text-xs whitespace-nowrap">Source:</span>
            <button onClick={() => setSourceFilter('all')}
              className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                sourceFilter === 'all'
                  ? 'bg-portal-accent border-portal-accent text-white'
                  : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas')}>
              All Sources
            </button>
            {SOURCE_FILTERS.map(s => (
              <button key={s} onClick={() => setSourceFilter(s)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  sourceFilter === s
                    ? 'bg-portal-accent border-portal-accent text-white'
                    : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas')}>
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-portal-accent" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ImageIcon className="w-10 h-10 text-on-canvas-muted mx-auto mb-3 opacity-40" />
            <p className="text-on-canvas-muted text-sm">No images match your filters</p>
          </div>
        ) : (
          <>
            <p className="text-on-canvas-muted text-xs">{filtered.length} of {items.length} files</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(item => (
                <MediaCard
                  key={`${item._source}-${item.id}`}
                  item={item}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={item => setItems(prev => [item, ...prev])}
          onBulkUploaded={items => setItems(prev => [...items, ...prev])}
        />
      )}
    </div>
  )
}
