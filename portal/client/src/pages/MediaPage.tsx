import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin as checkAdmin } from '@/types'
import {
  Image as ImageIcon, Upload, Copy, Check, Pencil, Trash2, X, ExternalLink,
  Search, Loader2, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: number
  _source: 'asset' | 'creative' | 'marketing' | 'ai' | 'media'
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeBrand(brand: string | null): string {
  if (!brand) return 'Other'
  if (brand.toUpperCase() === 'RIDE' || brand.toLowerCase().includes('ride lube')) return 'Ride Lube'
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

function sourcePillClass(source: string): string {
  switch (source) {
    case 'asset':     return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
    case 'creative':  return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    case 'marketing': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
    case 'ai':        return 'bg-violet-500/20 text-violet-300 border-violet-500/30'
    case 'media':     return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
    default:          return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'asset':     return 'Asset'
    case 'creative':  return 'Creative'
    case 'marketing': return 'Marketing'
    case 'ai':        return 'AI'
    case 'media':     return 'Media'
    default: return source
  }
}

function formatDate(dt: string): string {
  try { return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return dt }
}

function sourceLink(source: string): string {
  switch (source) {
    case 'asset':
    case 'creative':  return 'Asset Library'
    case 'marketing': return 'In-store Marketing'
    case 'ai':        return 'AI Creator'
    default:          return ''
  }
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
  onDeleted: (id: number) => void
  onUpdated: (item: MediaItem) => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label ?? '')
  const [brand, setBrand] = useState(item.brand ?? 'Sliquid')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isOwned = item._source === 'media'

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await api.put<MediaItem>(`/media/${item.id}`, { label, brand })
      onUpdated(updated)
      setEditing(false)
    } catch (err: any) {
      alert(err.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/media/${item.id}`)
      onDeleted(item.id)
      onClose()
    } catch (err: any) {
      alert(err.message ?? 'Delete failed')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0">
          <h2 className="text-on-canvas font-semibold text-base truncate pr-4">
            {item.label ?? item.s3_key.split('/').pop()}
          </h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Image preview */}
          <div className="bg-portal-bg flex items-center justify-center" style={{ maxHeight: 320 }}>
            <img
              src={item.file_url}
              alt={item.label ?? ''}
              className="max-w-full max-h-80 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          <div className="p-5 space-y-5">
            {/* File URL */}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Source', value: <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', sourcePillClass(item._source))}>{sourceLabel(item._source)}</span> },
                { label: 'Brand', value: <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', brandPillClass(item.brand))}>{normalizeBrand(item.brand)}</span> },
                { label: 'Uploaded', value: formatDate(item.created_at) },
                item.file_size ? { label: 'File Size', value: item.file_size } : null,
                item.dimensions ? { label: 'Dimensions', value: item.dimensions } : null,
                item.mime_type ? { label: 'Type', value: item.mime_type.split('/')[1]?.toUpperCase() ?? item.mime_type } : null,
                item.uploaded_by ? { label: 'Uploaded By', value: item.uploaded_by } : null,
              ].filter(Boolean).map((m, i) => (
                <div key={i} className="bg-portal-bg rounded-lg p-3 border border-portal-border">
                  <p className="text-on-canvas-muted text-[10px] font-medium uppercase tracking-wider mb-1">{m!.label}</p>
                  <p className="text-on-canvas text-sm">{m!.value}</p>
                </div>
              ))}
            </div>

            {/* Edit section (media rows only) */}
            {isOwned && (
              <div className="border-t border-portal-border pt-4">
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-on-canvas-muted text-xs font-medium block mb-1">Label</label>
                      <input
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-on-canvas focus:outline-none focus:border-portal-accent"
                      />
                    </div>
                    <div>
                      <label className="text-on-canvas-muted text-xs font-medium block mb-1">Brand</label>
                      <select
                        value={brand}
                        onChange={e => setBrand(e.target.value)}
                        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-on-canvas focus:outline-none focus:border-portal-accent"
                      >
                        <option value="Sliquid">Sliquid</option>
                        <option value="RIDE">Ride Lube</option>
                        <option value="Creator Creations">Creator Creations</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => { setEditing(false); setLabel(item.label ?? ''); setBrand(item.brand ?? 'Sliquid') }}
                        className="px-3 py-1.5 bg-surface-elevated border border-portal-border rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated border border-portal-border rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    {confirmDelete ? (
                      <>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Confirm Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="px-3 py-1.5 text-sm text-on-canvas-muted hover:text-on-canvas"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated border border-portal-border rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Read-only note for non-media sources */}
            {!isOwned && sourceLink(item._source) && (
              <p className="text-on-canvas-muted text-xs border-t border-portal-border pt-4">
                This file is managed in <span className="text-on-canvas">{sourceLink(item._source)}</span>. Edit or delete it there.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void
  onUploaded: (item: MediaItem) => void
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [brand, setBrand] = useState('Sliquid')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl) }
  }, [filePreviewUrl])

  function handleFileSelect(file: File) {
    setSelectedFile(file)
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file))
    } else {
      setFilePreviewUrl(null)
    }
    if (!label) {
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
      setLabel(base.charAt(0).toUpperCase() + base.slice(1))
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) { setError('Please select a file'); return }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('label', label)
      fd.append('brand', brand)
      const result = await api.postForm<MediaItem>('/media/upload', fd)
      onUploaded(result)
      onClose()
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
          <h2 className="text-on-canvas font-semibold text-base">Upload Image</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            ref={dropRef}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-portal-border rounded-xl p-6 text-center cursor-pointer hover:border-portal-accent/50 transition-colors"
          >
            {filePreviewUrl ? (
              <img src={filePreviewUrl} className="max-h-32 mx-auto rounded-lg object-contain mb-2" alt="preview" />
            ) : (
              <Upload className="w-8 h-8 text-on-canvas-muted mx-auto mb-2" />
            )}
            <p className="text-on-canvas-subtle text-sm">
              {selectedFile ? selectedFile.name : 'Drag & drop or click to select a file'}
            </p>
            {!selectedFile && (
              <p className="text-on-canvas-muted text-xs mt-1">Max 50 MB</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
            />
          </div>

          {/* Label */}
          <div>
            <label className="text-on-canvas text-sm font-medium block mb-1.5">Label <span className="text-on-canvas-muted font-normal">(optional)</span></label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Descriptive name for this file"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="text-on-canvas text-sm font-medium block mb-1.5">Brand</label>
            <select
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-on-canvas focus:outline-none focus:border-portal-accent"
            >
              <option value="Sliquid">Sliquid</option>
              <option value="RIDE">Ride Lube</option>
              <option value="Creator Creations">Creator Creations</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-elevated border border-portal-border rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas"
            >
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
  const [hovering, setHovering] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyUrl(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(item.file_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const imgSrc = item.thumbnail_url || item.file_url

  return (
    <div
      className="relative aspect-square rounded-xl overflow-hidden bg-portal-bg border border-portal-border cursor-pointer group"
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <img
        src={imgSrc}
        alt={item.label ?? ''}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        loading="lazy"
        onError={e => {
          const el = e.target as HTMLImageElement
          el.style.display = 'none'
          el.parentElement!.classList.add('flex', 'items-center', 'justify-center')
          const icon = document.createElement('div')
          icon.className = 'text-on-canvas-muted opacity-40'
          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
          el.parentElement!.appendChild(icon)
        }}
      />

      {/* Hover overlay */}
      {hovering && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity">
          <button
            onClick={copyUrl}
            title="Copy URL"
            className="p-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Brand pill */}
      <div className="absolute bottom-1.5 left-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none', brandPillClass(item.brand))}>
          {normalizeBrand(item.brand)}
        </span>
      </div>

      {/* Source pill */}
      <div className="absolute bottom-1.5 right-1.5">
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium leading-none', sourcePillClass(item._source))}>
          {sourceLabel(item._source)}
        </span>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const BRAND_FILTERS = ['all', 'Sliquid', 'Ride Lube', 'Creator Creations', 'Other'] as const
const SOURCE_FILTERS = ['all', 'asset', 'creative', 'marketing', 'ai', 'media'] as const
const SOURCE_LABELS: Record<string, string> = {
  all: 'All Sources', asset: 'Assets', creative: 'Creatives',
  marketing: 'Marketing', ai: 'AI', media: 'Media',
}

export default function MediaPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
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
      if (brandFilter === 'Other') {
        if (nb !== 'Other') return false
      } else if (nb !== brandFilter) return false
    }
    if (sourceFilter !== 'all' && item._source !== sourceFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const label = (item.label ?? '').toLowerCase()
      if (!label.includes(q)) return false
    }
    return true
  })

  function handleDeleted(id: number) {
    setItems(prev => prev.filter(i => !(i._source === 'media' && i.id === id)))
  }

  function handleUpdated(updated: MediaItem) {
    setItems(prev => prev.map(i => (i._source === 'media' && i.id === updated.id) ? updated : i))
    if (selectedItem?._source === 'media' && selectedItem.id === updated.id) {
      setSelectedItem(updated)
    }
  }

  function handleUploaded(item: MediaItem) {
    setItems(prev => [item, ...prev])
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
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent text-white rounded-lg text-sm font-medium hover:bg-portal-accent/90 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-surface border border-portal-border rounded-xl p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg pl-9 pr-3 py-2 text-sm text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent"
            />
          </div>

          {/* Brand pills */}
          <div className="flex flex-wrap gap-2">
            <span className="text-on-canvas-muted text-xs self-center mr-1 whitespace-nowrap">Brand:</span>
            {BRAND_FILTERS.map(b => (
              <button
                key={b}
                onClick={() => setBrandFilter(b)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  brandFilter === b
                    ? 'bg-portal-accent border-portal-accent text-white'
                    : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas',
                )}
              >
                {b === 'all' ? 'All' : b}
              </button>
            ))}
          </div>

          {/* Source pills */}
          <div className="flex flex-wrap gap-2">
            <span className="text-on-canvas-muted text-xs self-center mr-1 whitespace-nowrap">Source:</span>
            {SOURCE_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  sourceFilter === s
                    ? 'bg-portal-accent border-portal-accent text-white'
                    : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:text-on-canvas',
                )}
              >
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
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
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

      {/* Detail modal */}
      {selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  )
}
