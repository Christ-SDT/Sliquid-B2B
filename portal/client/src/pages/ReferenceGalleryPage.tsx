import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { Images, Upload, Search, Pencil, Trash2, X, Check, AlertCircle, Loader2, ChevronDown, ChevronUp, Copy, ExternalLink, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RefImg {
  id: number
  label: string
  filename: string
  file_url: string
  file_size: string
  size_bytes: number
  mime_type: string
  uploaded_by: string
  created_at: string
}

interface UploadEntry {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  result?: RefImg
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b === 0) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('portal_token') ?? ''
  return { Authorization: `Bearer ${token}` }
}

// ─── UploadPanel ──────────────────────────────────────────────────────────────

interface UploadPanelProps {
  onClose: () => void
  onUploaded: (img: RefImg) => void
}

function UploadPanel({ onClose, onUploaded }: UploadPanelProps) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [running, setRunning] = useState(false)
  const dragCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: FileList | File[]) {
    const newEntries: UploadEntry[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, status: 'pending', progress: 0 }))
    setEntries(prev => [...prev, ...newEntries])
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault(); dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault(); dragCounter.current--
    if (dragCounter.current === 0) setDragOver(false)
  }
  function onDragOver(e: DragEvent) { e.preventDefault() }
  function onDrop(e: DragEvent) {
    e.preventDefault(); dragCounter.current = 0; setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ''
  }

  const totalBytes = entries.reduce((sum, e) => sum + e.file.size, 0)
  const overLimit = totalBytes > 3_000_000_000

  const uploadAll = useCallback(async (toUpload: UploadEntry[]) => {
    setRunning(true)
    for (const entry of toUpload) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading', progress: 0 } : e))

      await new Promise<void>(resolve => {
        const formData = new FormData()
        formData.append('file', entry.file)
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable) {
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, progress: Math.round(ev.loaded / ev.total * 100) } : e))
          }
        }
        xhr.onload = () => {
          if (xhr.status === 201) {
            const result: RefImg = JSON.parse(xhr.responseText)
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done', progress: 100, result } : e))
            onUploaded(result)
          } else {
            let msg = 'Upload failed'
            try { msg = JSON.parse(xhr.responseText).message ?? msg } catch { /* ignore */ }
            setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', error: msg } : e))
          }
          resolve()
        }
        xhr.onerror = () => {
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', error: 'Network error' } : e))
          resolve()
        }
        xhr.open('POST', `${BASE}/reference-images/upload`)
        xhr.setRequestHeader('Authorization', authHeaders().Authorization)
        xhr.send(formData)
      })
    }
    setRunning(false)
  }, [onUploaded])

  function startUpload() {
    const pending = entries.filter(e => e.status === 'pending')
    if (pending.length > 0) uploadAll(pending)
  }

  function retryFailed() {
    const failed = entries.filter(e => e.status === 'error').map(e => ({ ...e, status: 'pending' as const, progress: 0, error: undefined }))
    setEntries(prev => prev.map(e => {
      const retry = failed.find(f => f.id === e.id)
      return retry ?? e
    }))
    uploadAll(failed)
  }

  const doneCount = entries.filter(e => e.status === 'done').length
  const errorCount = entries.filter(e => e.status === 'error').length
  const pendingCount = entries.filter(e => e.status === 'pending').length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-surface border border-portal-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0">
          <h2 className="text-on-canvas font-semibold">Upload Reference Images</h2>
          <button onClick={onClose} disabled={running} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={cn(
            'mx-5 mt-4 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors flex-shrink-0',
            dragOver ? 'border-portal-accent bg-portal-accent/10' : 'border-portal-border hover:border-portal-accent/50',
          )}
          onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFileInput} />
          <Upload className="w-8 h-8 text-on-canvas-muted mx-auto mb-2" />
          <p className="text-on-canvas text-sm font-medium">Drop images here or click to browse</p>
          <p className="text-on-canvas-muted text-xs mt-1">JPEG, PNG, WebP, GIF</p>
        </div>

        {overLimit && (
          <div className="mx-5 mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-amber-300 text-xs">Total size exceeds 3 GB — uploads may be slow</p>
          </div>
        )}

        {/* Queue */}
        {entries.length > 0 && (
          <div className="mx-5 mt-3 flex-1 overflow-y-auto space-y-2 min-h-0">
            {/* Overall progress bar */}
            {entries.length > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-on-canvas-muted mb-1">
                  <span>{doneCount}/{entries.length} done</span>
                  {errorCount > 0 && <span className="text-red-400">{errorCount} failed</span>}
                </div>
                <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-portal-accent rounded-full transition-all"
                    style={{ width: `${(doneCount / entries.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {entries.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 bg-surface-elevated rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-on-canvas text-xs font-medium truncate">{entry.file.name}</p>
                  {entry.status === 'uploading' && (
                    <div className="h-1 bg-portal-border rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-portal-accent rounded-full transition-all" style={{ width: `${entry.progress}%` }} />
                    </div>
                  )}
                  {entry.status === 'error' && (
                    <p className="text-red-400 text-[10px] mt-0.5">{entry.error}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {entry.status === 'pending' && <span className="text-on-canvas-muted text-[10px]">Waiting</span>}
                  {entry.status === 'uploading' && <Loader2 className="w-4 h-4 text-portal-accent animate-spin" />}
                  {entry.status === 'done' && <Check className="w-4 h-4 text-emerald-400" />}
                  {entry.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-t border-portal-border flex-shrink-0 mt-4">
          {errorCount > 0 && !running && (
            <button onClick={retryFailed} className="text-sm text-portal-accent hover:text-portal-accent/80 transition-colors">
              Retry Failed ({errorCount})
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} disabled={running} className="px-4 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas border border-portal-border rounded-lg transition-colors disabled:opacity-50">
              {doneCount === entries.length && entries.length > 0 ? 'Close' : 'Cancel'}
            </button>
            {pendingCount > 0 && (
              <button
                onClick={startUpload}
                disabled={running}
                className="px-4 py-2 text-sm font-medium bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Upload {pendingCount} {pendingCount === 1 ? 'File' : 'Files'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── EditModal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  img: RefImg
  onClose: () => void
  onSaved: (updated: RefImg) => void
}

function EditModal({ img, onClose, onSaved }: EditModalProps) {
  const [label, setLabel] = useState(img.label)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  async function save() {
    if (!label.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/reference-images/${img.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ label: label.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Failed') }
      const updated: RefImg = await res.json()
      onSaved(updated)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(img.file_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={img.file_url}
            alt={img.label}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60">
        <div className="bg-surface border border-portal-border rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
            <h2 className="text-on-canvas font-semibold text-sm">Edit Image</h2>
            <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Preview */}
            <div className="relative group cursor-pointer rounded-xl overflow-hidden bg-surface-elevated border border-portal-border" onClick={() => setLightbox(true)}>
              <img
                src={img.file_url}
                alt={img.label}
                className="w-full h-48 object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
                  <Maximize2 className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            {/* Metadata row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-elevated border border-portal-border rounded-lg px-3 py-2">
                <p className="text-on-canvas-muted text-[10px] font-semibold uppercase tracking-wider mb-0.5">Size</p>
                <p className="text-on-canvas text-sm font-medium">{img.file_size || '—'}</p>
              </div>
              <div className="bg-surface-elevated border border-portal-border rounded-lg px-3 py-2">
                <p className="text-on-canvas-muted text-[10px] font-semibold uppercase tracking-wider mb-0.5">Date Added</p>
                <p className="text-on-canvas text-sm font-medium">{formatDate(img.created_at)}</p>
              </div>
            </div>

            {/* Label */}
            <div>
              <label className="block text-on-canvas-muted text-[10px] font-semibold uppercase tracking-wider mb-1.5">Name</label>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                autoFocus
                className="w-full bg-surface-elevated border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>

            {/* File URL */}
            <div>
              <label className="block text-on-canvas-muted text-[10px] font-semibold uppercase tracking-wider mb-1.5">File URL</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 bg-surface-elevated border border-portal-border rounded-lg px-3 py-2">
                  <p className="text-on-canvas text-xs font-mono truncate">{img.file_url}</p>
                </div>
                <button
                  onClick={copyUrl}
                  title="Copy URL"
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
                    copied
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-portal-accent/50',
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy URL'}
                </button>
                <a
                  href={img.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-portal-accent/50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas border border-portal-border rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !label.trim()}
              className="px-4 py-2 text-sm font-medium bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReferenceGalleryPage() {
  const [images, setImages] = useState<RefImg[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [editTarget, setEditTarget] = useState<RefImg | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function loadImages() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BASE}/reference-images`, { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to load images')
      const data: { images: RefImg[]; totalBytes: number } = await res.json()
      setImages(data.images)
      setTotalBytes(data.totalBytes)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadImages() }, [])

  function handleUploaded(img: RefImg) {
    setImages(prev => [img, ...prev])
    setTotalBytes(prev => prev + img.size_bytes)
  }

  function handleSaved(updated: RefImg) {
    setImages(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  async function handleDelete(id: number) {
    setDeleting(true); setDeleteError('')
    try {
      const res = await fetch(`${BASE}/reference-images/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Delete failed') }
      const img = images.find(i => i.id === id)
      setImages(prev => prev.filter(i => i.id !== id))
      if (img) setTotalBytes(prev => prev - img.size_bytes)
      setConfirmDeleteId(null)
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
    } catch (err: any) {
      setDeleteError(err.message ?? 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected)
    setDeleting(true); setDeleteError('')
    try {
      const res = await fetch(`${BASE}/reference-images/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Bulk delete failed') }
      const deletedBytes = images.filter(i => ids.includes(i.id)).reduce((s, i) => s + i.size_bytes, 0)
      setImages(prev => prev.filter(i => !ids.includes(i.id)))
      setTotalBytes(prev => prev - deletedBytes)
      setSelected(new Set())
      setBulkConfirm(false)
    } catch (err: any) {
      setDeleteError(err.message ?? 'Bulk delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(i => i.id)))
    }
  }

  // ── Filtered + sorted ──────────────────────────────────────────────────────

  const isSliquid = (i: RefImg) => {
    const text = (i.label + ' ' + i.filename).toLowerCase()
    return text.includes('sliquid') && !text.includes('ride') && !text.includes('rocco')
  }

  const filtered = images
    .filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase()) || i.filename.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // Sliquid-branded items always float to the top
      const sliquidDiff = (isSliquid(b) ? 1 : 0) - (isSliquid(a) ? 1 : 0)
      if (sliquidDiff !== 0) return sliquidDiff
      if (sortBy === 'name') return a.label.localeCompare(b.label)
      if (sortBy === 'size') return b.size_bytes - a.size_bytes
      return a.created_at < b.created_at ? 1 : -1
    })

  const storagePercent = Math.min((totalBytes / 10e9) * 100, 100)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center">
            <Images className="w-5 h-5 text-portal-accent" />
          </div>
          <div>
            <h1 className="text-on-canvas text-xl font-bold">Reference Gallery</h1>
            <p className="text-on-canvas-muted text-sm">Reference images for AI Creator generations</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Storage indicator */}
      <div className="bg-surface border border-portal-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-on-canvas-muted text-xs font-medium">Storage Used</span>
          <span className="text-on-canvas text-xs font-semibold">{fmtBytes(totalBytes)} / 10 GB</span>
        </div>
        <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <div className="h-full bg-portal-accent rounded-full transition-all" style={{ width: `${storagePercent}%` }} />
        </div>
        <p className="text-on-canvas-muted text-[10px] mt-1.5">{images.length} image{images.length !== 1 ? 's' : ''} stored</p>
      </div>

      {/* Error */}
      {(error || deleteError) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error || deleteError}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-3 py-2 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          className="bg-surface border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
        >
          <option value="date">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="size">Largest first</option>
        </select>
        {filtered.length > 0 && (
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas border border-portal-border rounded-lg transition-colors"
          >
            {selected.size === filtered.length ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-surface border border-portal-border rounded-xl px-4 py-3">
          <span className="text-on-canvas text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-sm text-on-canvas-subtle hover:text-on-canvas transition-colors">
              Clear
            </button>
            {bulkConfirm ? (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirm Delete
              </button>
            ) : (
              <button
                onClick={() => setBulkConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 border border-red-400/40 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selected.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-portal-accent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Images className="w-10 h-10 text-on-canvas-muted/30 mx-auto mb-3" />
          <p className="text-on-canvas-muted text-sm">{search ? 'No images match your search' : 'No reference images yet — upload some to get started'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(img => {
            const isSelected = selected.has(img.id)
            const isConfirmDelete = confirmDeleteId === img.id

            return (
              <div
                key={img.id}
                className={cn(
                  'group relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer',
                  isSelected ? 'border-portal-accent ring-2 ring-portal-accent/30' : 'border-portal-border hover:border-portal-accent/50',
                )}
                onClick={() => toggleSelect(img.id)}
              >
                <img
                  src={img.file_url}
                  alt={img.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Selection checkbox */}
                <div className={cn(
                  'absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                  isSelected
                    ? 'bg-portal-accent border-portal-accent'
                    : 'bg-black/40 border-white/60 opacity-0 group-hover:opacity-100',
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <p className="text-white text-[11px] font-medium leading-tight truncate">{img.label}</p>
                  <p className="text-white/60 text-[9px]">{img.file_size} · {formatDate(img.created_at)}</p>
                </div>

                {/* Action buttons */}
                <div
                  className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => setEditTarget(img)}
                    className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3 text-white" />
                  </button>
                  {isConfirmDelete ? (
                    <button
                      onClick={() => handleDelete(img.id)}
                      disabled={deleting}
                      className="w-6 h-6 rounded-md bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                      title="Confirm delete"
                    >
                      {deleting ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Check className="w-3 h-3 text-white" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(img.id)}
                      className="w-6 h-6 rounded-md bg-black/60 hover:bg-red-500 flex items-center justify-center transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadPanel
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
      {editTarget && (
        <EditModal
          img={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
