import { useEffect, useState, useRef, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/types'
import { Asset, Creative, AiImage } from '@/types'
import {
  Search, FolderOpen, Download, ExternalLink, Eye,
  FileImage, FileText, Share2, Image, Video, Mail, Printer, Megaphone, BookOpen,
  Plus, Trash2, X, Loader2, Pencil, ChevronDown, ChevronRight, Folder, ArrowLeft, LayoutGrid, Sparkles, Upload, Star,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function triggerDownload(url: string, name: string) {
  const ext = url.split('?')[0].split('.').pop() ?? ''
  const filename = ext ? `${name}.${ext}` : name
  const token = localStorage.getItem('portal_token') ?? ''
  const base = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const params = new URLSearchParams({ url, filename })
  fetch(`${base}/media/proxy-download?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    })
    .catch(() => window.open(url, '_blank'))
}

// ─── Brand constants ──────────────────────────────────────────────────────────

const BRAND_OPTIONS = ['Sliquid', 'RIDE', 'Ride Rocco', 'Sliquid Science']
// Display names (maps DB value → human label)
const BRAND_DISPLAY: Record<string, string> = { 'RIDE': 'Ride Lube' }
// Preferred sort order (by DB value)
const BRAND_ORDER = ['Sliquid', 'RIDE', 'Ride Rocco', 'Sliquid Science', 'User Generated Content']

function displayBrand(brand: string): string {
  return BRAND_DISPLAY[brand] ?? brand
}

function sortBrands(brands: string[]): string[] {
  return [...brands].sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a)
    const bi = BRAND_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

// ─── Section mapping ──────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, string> = {
  Logo:           'Logos',
  Banner:         'Banners',
  Social:         'Social Media',
  'Social Media': 'Social Media',
  Document:       'Documents',
  Print:          'Documents',
  Email:          'Email Templates',
  Multi:          'Campaign Materials',
  Video:          'Videos',
  'AI Generated': 'Generated Images',
}

// ─── Unified library item ─────────────────────────────────────────────────────

type AiLibraryItem = AiImage & {
  _source: 'ai'
  displayName: string
  brand: string
  type: string
  file_url: string
  thumbnail_url: string
  file_size?: null
  dimensions?: null
  featured?: number
}

type LibraryItem =
  | (Asset & { _source: 'asset'; displayName: string })
  | (Creative & { _source: 'creative'; displayName: string })
  | AiLibraryItem

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Logo:           Image,
  Banner:         FileImage,
  Social:         Share2,
  Document:       FileText,
  'Social Media': Megaphone,
  Email:          Mail,
  Print:          Printer,
  Multi:          Megaphone,
  Video:          Video,
  'AI Generated': Sparkles,
}

interface SectionOption { label: string; type: string; source: 'asset' | 'creative' }
const SECTION_OPTIONS: SectionOption[] = [
  { label: 'Logos',              type: 'Logo',      source: 'asset'    },
  { label: 'Banners',           type: 'Banner',    source: 'asset'    },
  { label: 'Social Media',       type: 'Social',    source: 'asset'    },
  { label: 'Documents',          type: 'Document',  source: 'asset'    },
  { label: 'Email Templates',    type: 'Email',     source: 'creative' },
  { label: 'Campaign Materials', type: 'Multi',     source: 'creative' },
  { label: 'Videos',             type: 'Video',     source: 'creative' },
  { label: 'Other…',             type: '__other__', source: 'asset'    },
]

function groupByBrand(items: LibraryItem[]): Map<string, Map<string, LibraryItem[]>> {
  const map = new Map<string, Map<string, LibraryItem[]>>()
  for (const item of items) {
    const section = SECTION_MAP[item.type] ?? 'Other'
    if (!map.has(item.brand)) map.set(item.brand, new Map())
    const sectionMap = map.get(item.brand)!
    if (!sectionMap.has(section)) sectionMap.set(section, [])
    sectionMap.get(section)!.push(item)
  }
  return map
}

// ─── Brand select field (shared by Add + Edit modals) ─────────────────────────

interface BrandSelectProps {
  value: string          // DB value or '__custom__'
  customValue: string
  onChangeValue: (v: string) => void
  onChangeCustom: (v: string) => void
  datalistId: string
}

function BrandSelect({ value, customValue, onChangeValue, onChangeCustom, datalistId }: BrandSelectProps) {
  const isCustom = value === '__custom__'
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={e => onChangeValue(e.target.value)}
        className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
      >
        {BRAND_OPTIONS.map(b => (
          <option key={b} value={b}>{displayBrand(b)}</option>
        ))}
        <option value="__custom__">Other (type a new brand…)</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={customValue}
          onChange={e => onChangeCustom(e.target.value)}
          placeholder="Enter brand name"
          required
          list={datalistId}
          className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
        />
      )}
      <datalist id={datalistId}>
        {BRAND_OPTIONS.map(b => <option key={b} value={b}>{displayBrand(b)}</option>)}
      </datalist>
    </div>
  )
}

// Helper: convert a brand DB value to the select state (option value or '__custom__')
function toBrandOpt(brand: string): string {
  return BRAND_OPTIONS.includes(brand) ? brand : '__custom__'
}

// ─── Video thumbnail helper ───────────────────────────────────────────────────

function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, (video.duration || 1) * 0.25)
    })
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 360
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
    })
    video.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null) })
  })
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

interface AddItemModalProps {
  onClose: () => void
  onAdded: (item: LibraryItem) => void
  onBulkAdded?: (items: LibraryItem[]) => void
}

function AddItemModal({ onClose, onAdded, onBulkAdded }: AddItemModalProps) {
  const [sectionOpt, setSectionOpt] = useState<SectionOption>(SECTION_OPTIONS[0])
  const [customSection, setCustomSection] = useState('')
  const [nameTitle, setNameTitle] = useState('')
  const [brandOpt, setBrandOpt] = useState(BRAND_OPTIONS[0])
  const [customBrand, setCustomBrand] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [description, setDescription] = useState('')
  const [campaign, setCampaign] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [videoThumbs, setVideoThumbs] = useState<Map<number, { blob: Blob; preview: string }>>(new Map())
  const [notify, setNotify] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isOtherSection = sectionOpt.type === '__other__'
  const resolvedType = isOtherSection ? customSection : sectionOpt.type
  const isCreative = sectionOpt.source === 'creative'
  const brand = brandOpt === '__custom__' ? customBrand : brandOpt
  const isBulk = selectedFiles.length > 1

  useEffect(() => {
    return () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl) }
  }, [filePreviewUrl])

  useEffect(() => {
    return () => { videoThumbs.forEach(t => URL.revokeObjectURL(t.preview)) }
  }, [videoThumbs])

  async function handleFilesSelect(files: File[]) {
    if (files.length === 0) return
    setSelectedFiles(files)

    // Preview from first file only
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    const first = files[0]
    if (first.type.startsWith('image/')) {
      const url = URL.createObjectURL(first)
      setFilePreviewUrl(url)
      if (files.length === 1) {
        const img = new window.Image()
        img.onload = () => setDimensions(`${img.naturalWidth}×${img.naturalHeight}`)
        img.src = url
      }
    } else {
      setFilePreviewUrl(null)
      setDimensions('')
    }

    // Generate thumbnails for any video files
    const newThumbs = new Map<number, { blob: Blob; preview: string }>()
    await Promise.all(files.map(async (f, i) => {
      if (f.type.startsWith('video/')) {
        const blob = await generateVideoThumbnail(f)
        if (blob) newThumbs.set(i, { blob, preview: URL.createObjectURL(blob) })
      }
    }))
    if (newThumbs.size > 0) {
      setVideoThumbs(newThumbs)
      // For a single video, use the generated thumbnail as the preview
      if (files.length === 1 && newThumbs.has(0)) {
        setFilePreviewUrl(newThumbs.get(0)!.preview)
      }
    }

    // Auto-fill name + size only for single file
    if (files.length === 1) {
      if (!nameTitle) {
        const baseName = first.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
        setNameTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1))
      }
      const bytes = first.size
      if (bytes < 1024) setFileSize(`${bytes} B`)
      else if (bytes < 1024 * 1024) setFileSize(`${(bytes / 1024).toFixed(1)} KB`)
      else setFileSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`)
    } else {
      setFileSize('')
      setDimensions('')
    }
  }

  function clearFiles() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    videoThumbs.forEach(t => URL.revokeObjectURL(t.preview))
    setSelectedFiles([])
    setFilePreviewUrl(null)
    setVideoThumbs(new Map())
    setFileSize('')
    setDimensions('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (isBulk) {
        // ── Bulk upload ──
        const fd = new FormData()
        selectedFiles.forEach((f, i) => {
          fd.append('files', f)
          const thumb = videoThumbs.get(i)
          if (thumb) fd.append(`thumbnail_${i}`, thumb.blob, 'thumbnail.jpg')
        })
        fd.append('brand', brand)
        fd.append('type', resolvedType)
        if (notify) fd.append('notify', 'true')

        const endpoint = isCreative ? '/creatives/bulk-upload' : '/assets/bulk-upload'
        const result = await api.postForm<{ items: (Asset | Creative)[]; count: number; errors?: string[] }>(endpoint, fd)

        if (result.errors?.length) setError(`${result.count} uploaded. Failed: ${result.errors.join('; ')}`)

        const mapped: LibraryItem[] = result.items.map(item =>
          isCreative
            ? { ...(item as Creative), _source: 'creative' as const, displayName: (item as Creative).title }
            : { ...(item as Asset), _source: 'asset' as const, displayName: (item as Asset).name }
        )
        if (onBulkAdded) onBulkAdded(mapped)
        if (!result.errors?.length) onClose()
      } else if (selectedFiles.length === 1) {
        // ── Single file upload ──
        const selectedFile = selectedFiles[0]
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('type', resolvedType)
        formData.append('brand', brand)
        if (fileSize) formData.append('file_size', fileSize)
        if (dimensions) formData.append('dimensions', dimensions)
        // For videos, send the generated thumbnail file; for others, send thumbnail URL text
        const videoThumb = videoThumbs.get(0)
        if (videoThumb) {
          formData.append('thumbnail', videoThumb.blob, 'thumbnail.jpg')
        } else if (thumbnailUrl) {
          formData.append('thumbnail_url', thumbnailUrl)
        }
        if (notify) formData.append('notify', 'true')

        if (isCreative) {
          formData.append('title', nameTitle)
          if (description) formData.append('description', description)
          if (campaign) formData.append('campaign', campaign)
          const result = await api.postForm<Creative & { id: number }>('/creatives/upload', formData)
          onAdded({ ...result, _source: 'creative', displayName: result.title })
        } else {
          formData.append('name', nameTitle)
          const result = await api.postForm<Asset & { id: number }>('/assets/upload', formData)
          onAdded({ ...result, _source: 'asset', displayName: result.name })
        }
        onClose()
      } else {
        // ── URL-only ──
        if (sectionOpt.source === 'asset') {
          const result = await api.post<{ id: number }>('/assets', {
            name: nameTitle, brand, type: resolvedType,
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl || null,
            file_size: fileSize || null,
            dimensions: dimensions || null,
          })
          onAdded({
            id: result.id, name: nameTitle, brand, type: resolvedType,
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl || null,
            file_size: fileSize || null,
            dimensions: dimensions || null,
            _source: 'asset', displayName: nameTitle,
          })
        } else {
          const result = await api.post<{ id: number }>('/creatives', {
            title: nameTitle, brand, type: resolvedType,
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl || null,
            file_size: fileSize || null,
            dimensions: dimensions || null,
            description: description || null,
            campaign: campaign || null,
          })
          onAdded({
            id: result.id, title: nameTitle, brand, type: resolvedType,
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl || null,
            file_size: fileSize || null,
            dimensions: dimensions || null,
            description: description || null,
            campaign: campaign || null,
            _source: 'creative', displayName: nameTitle,
          })
        }
        onClose()
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">Add to Asset Library</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Section */}
          <div className="space-y-2">
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Section</label>
            <select
              value={sectionOpt.type}
              onChange={e => setSectionOpt(SECTION_OPTIONS.find(s => s.type === e.target.value)!)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
            >
              {SECTION_OPTIONS.map(s => (
                <option key={s.type} value={s.type}>{s.label}</option>
              ))}
            </select>
            {isOtherSection && (
              <input
                type="text"
                value={customSection}
                onChange={e => setCustomSection(e.target.value)}
                placeholder="e.g. Product Sheets"
                required
                autoFocus
                className="w-full bg-portal-bg border border-portal-accent/60 rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            )}
          </div>

          {/* Name / Title — hidden for bulk (server derives each name from filename) */}
          {!isBulk && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                {isCreative ? 'Title' : 'Name'}
              </label>
              <input
                type="text"
                value={nameTitle}
                onChange={e => setNameTitle(e.target.value)}
                placeholder={isCreative ? 'e.g. Summer Campaign Banner' : 'e.g. H2O 4oz Info Sheet'}
                required={selectedFiles.length === 0}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          )}

          {/* Brand */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Brand</label>
            <BrandSelect
              value={brandOpt}
              customValue={customBrand}
              onChangeValue={setBrandOpt}
              onChangeCustom={setCustomBrand}
              datalistId="brand-options-add"
            />
          </div>

          {/* File upload dropzone */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Upload File{isBulk && <span className="ml-2 px-2 py-0.5 bg-portal-accent/20 text-portal-accent rounded-full text-xs font-semibold">{selectedFiles.length} files</span>}</label>
            <div
              className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer
                ${selectedFiles.length > 0
                  ? 'border-portal-accent bg-portal-accent/5'
                  : 'border-portal-border hover:border-portal-accent/60 hover:bg-portal-accent/5'}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); if (files.length) handleFilesSelect(files) }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.mp4,.mov,.webm,.svg,.ai,.eps,.zip"
                onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesSelect(files) }}
              />
              {selectedFiles.length > 0 ? (
                isBulk ? (
                  <div className="flex items-center gap-3">
                    {filePreviewUrl
                      ? <img src={filePreviewUrl} alt="preview" className="w-14 h-14 object-contain rounded-lg flex-shrink-0" />
                      : <div className="w-14 h-14 bg-portal-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Upload className="w-6 h-6 text-portal-accent" />
                        </div>
                    }
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-on-canvas text-sm font-medium">{selectedFiles.length} files selected</p>
                      <p className="text-on-canvas-muted text-xs truncate">{selectedFiles[0].name}{selectedFiles.length > 1 ? ` + ${selectedFiles.length - 1} more` : ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); clearFiles() }}
                      className="text-on-canvas-muted hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {filePreviewUrl
                      ? <img src={filePreviewUrl} alt="preview" className="w-14 h-14 object-contain rounded-lg flex-shrink-0" />
                      : <div className="w-14 h-14 bg-portal-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Upload className="w-6 h-6 text-portal-accent" />
                        </div>
                    }
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-on-canvas text-sm font-medium truncate">{selectedFiles[0].name}</p>
                      {fileSize && <p className="text-on-canvas-muted text-xs">{fileSize}{dimensions && ` · ${dimensions}`}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); clearFiles() }}
                      className="text-on-canvas-muted hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-2 py-2">
                  <div className="w-10 h-10 mx-auto bg-surface-elevated rounded-xl flex items-center justify-center">
                    <Upload className="w-5 h-5 text-on-canvas-muted" />
                  </div>
                  <div>
                    <p className="text-on-canvas text-sm font-medium">Click to upload or drag & drop</p>
                    <p className="text-on-canvas-muted text-xs mt-0.5">PNG, JPG, PDF, MP4, SVG, AI, EPS, ZIP… · Max 750 MB · Select multiple files for bulk upload</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* URL divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-portal-border" />
            <span className="text-on-canvas-muted text-xs">or paste a URL</span>
            <div className="flex-1 h-px bg-portal-border" />
          </div>

          {/* File URL — optional when file uploaded */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              File URL
              {selectedFiles.length > 0 && <span className="text-on-canvas-muted font-normal ml-1">(overridden by uploaded file)</span>}
            </label>
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-content/uploads/file.pdf"
              required={selectedFiles.length === 0}
              disabled={selectedFiles.length > 0}
              className={`w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors
                         ${selectedFiles.length > 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Thumbnail URL */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              Thumbnail URL <span className="text-on-canvas-muted font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-content/uploads/thumb.jpg"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Description — creatives only */}
          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Description <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of this asset…"
                rows={2}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
              />
            </div>
          )}

          {/* Campaign — Campaign Materials only */}
          {sectionOpt.label === 'Campaign Materials' && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Campaign <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
                placeholder="e.g. Summer 2025"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          )}

          {/* File size + dimensions (auto-filled from upload, editable) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                File Size <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={fileSize}
                onChange={e => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Dimensions <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={dimensions}
                onChange={e => setDimensions(e.target.value)}
                placeholder="e.g. 1920×1080"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          </div>

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
              {saving ? (selectedFiles.length > 0 ? 'Uploading…' : 'Adding…') : (isBulk ? `Upload ${selectedFiles.length} Files` : 'Add Item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

const ALL_ASSET_TYPES = ['Logo', 'Banner', 'Social', 'Document']
const ALL_CREATIVE_TYPES = ['Print', 'Banner', 'Social Media', 'Email', 'Multi', 'Video']

interface EditItemModalProps {
  item: LibraryItem
  onClose: () => void
  onSaved: (updated: LibraryItem) => void
}

function EditItemModal({ item, onClose, onSaved }: EditItemModalProps) {
  const isCreative = item._source === 'creative'
  const sourceSectionOptions = SECTION_OPTIONS.filter(s => s.type === '__other__' || s.source === (isCreative ? 'creative' : 'asset'))

  const initSectionOpt = sourceSectionOptions.find(s => s.type === item.type) ?? sourceSectionOptions.find(s => s.type === '__other__')!
  const initCustomSection = sourceSectionOptions.find(s => s.type === item.type) ? '' : item.type

  const initBrandOpt = toBrandOpt(item.brand)
  const [nameTitle, setNameTitle] = useState(item.displayName)
  const [brandOpt, setBrandOpt] = useState(initBrandOpt)
  const [customBrand, setCustomBrand] = useState(initBrandOpt === '__custom__' ? item.brand : '')
  const [sectionOpt, setSectionOpt] = useState<SectionOption>(initSectionOpt)
  const [customSection, setCustomSection] = useState(initCustomSection)
  const isOtherSection = sectionOpt.type === '__other__'
  const type = isOtherSection ? customSection : sectionOpt.type
  const [fileUrl, setFileUrl] = useState(item.file_url)
  const [thumbnailUrl, setThumbnailUrl] = useState(item.thumbnail_url ?? '')
  const [fileSize, setFileSize] = useState(item.file_size ?? '')
  const [dimensions, setDimensions] = useState(item.dimensions ?? '')
  const [description, setDescription] = useState(
    'description' in item ? (item.description ?? '') : ''
  )
  const [campaign, setCampaign] = useState(
    'campaign' in item ? (item.campaign ?? '') : ''
  )
  const [featured, setFeatured] = useState<number>(item.featured ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const brand = brandOpt === '__custom__' ? customBrand : brandOpt

  useEffect(() => {
    return () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl) }
  }, [filePreviewUrl])

  function handleFileSelect(file: File) {
    setSelectedFile(file)
    const bytes = file.size
    if (bytes < 1024) setFileSize(`${bytes} B`)
    else if (bytes < 1024 * 1024) setFileSize(`${(bytes / 1024).toFixed(1)} KB`)
    else setFileSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`)
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setFilePreviewUrl(url)
      const img = new window.Image()
      img.onload = () => setDimensions(`${img.naturalWidth}×${img.naturalHeight}`)
      img.src = url
    } else {
      setFilePreviewUrl(null)
    }
  }

  function clearFile() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    setSelectedFile(null)
    setFilePreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (selectedFile && item._source !== 'ai') {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('type', type)
        formData.append('brand', brand)
        if (fileSize) formData.append('file_size', fileSize)
        if (dimensions) formData.append('dimensions', dimensions)
        if (thumbnailUrl) formData.append('thumbnail_url', thumbnailUrl)
        if (isCreative) {
          formData.append('title', nameTitle)
          if (description) formData.append('description', description)
          if (campaign) formData.append('campaign', campaign)
          const updated = await api.putForm<Creative>(`/creatives/${item.id}/file`, formData)
          onSaved({ ...updated, _source: 'creative', displayName: updated.title })
        } else {
          formData.append('name', nameTitle)
          const updated = await api.putForm<Asset>(`/assets/${item.id}/file`, formData)
          onSaved({ ...updated, _source: 'asset', displayName: updated.name })
        }
        onClose()
        return
      }

      if (item._source === 'asset') {
        const updated = await api.put<Asset>(`/assets/${item.id}`, {
          name: nameTitle, brand, type,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          featured,
        })
        onSaved({ ...updated, _source: 'asset', displayName: updated.name })
      } else {
        const updated = await api.put<Creative>(`/creatives/${item.id}`, {
          title: nameTitle, brand, type,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          description: description || null,
          campaign: campaign || null,
          featured,
        })
        onSaved({ ...updated, _source: 'creative', displayName: updated.title })
      }
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">Edit Item</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Replace file (only for asset/creative, not AI images) */}
          {item._source !== 'ai' && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Replace File <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,.pdf,.mp4,.mov,.webm,.svg,.ai,.eps,.zip"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
              />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 bg-portal-accent/5 border border-portal-accent/30 rounded-xl">
                  {filePreviewUrl
                    ? <img src={filePreviewUrl} alt="preview" className="w-10 h-10 object-contain rounded flex-shrink-0" />
                    : <div className="w-10 h-10 bg-portal-accent/10 rounded flex items-center justify-center flex-shrink-0">
                        <Upload className="w-5 h-5 text-portal-accent" />
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-on-canvas text-sm font-medium truncate">{selectedFile.name}</p>
                    {fileSize && <p className="text-on-canvas-muted text-xs">{fileSize}</p>}
                  </div>
                  <button type="button" onClick={clearFile} className="text-on-canvas-muted hover:text-red-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-surface-elevated border border-portal-border
                             hover:border-portal-accent text-on-canvas text-sm rounded-xl transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choose replacement file
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Section</label>
            <select
              value={sectionOpt.type}
              onChange={e => setSectionOpt(sourceSectionOptions.find(s => s.type === e.target.value)!)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
            >
              {sourceSectionOptions.map(s => <option key={s.type} value={s.type}>{s.label}</option>)}
            </select>
            {isOtherSection && (
              <input
                type="text"
                value={customSection}
                onChange={e => setCustomSection(e.target.value)}
                placeholder="Enter section name…"
                className="mt-2 w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
              />
            )}
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              {isCreative ? 'Title' : 'Name'}
            </label>
            <input
              type="text"
              value={nameTitle}
              onChange={e => setNameTitle(e.target.value)}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Brand</label>
            <BrandSelect
              value={brandOpt}
              customValue={customBrand}
              onChangeValue={setBrandOpt}
              onChangeCustom={setCustomBrand}
              datalistId="brand-options-edit"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">File URL</label>
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              Thumbnail URL <span className="text-on-canvas-muted font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Description <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
              />
            </div>
          )}

          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Campaign <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                File Size <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={fileSize}
                onChange={e => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Dimensions <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={dimensions}
                onChange={e => setDimensions(e.target.value)}
                placeholder="e.g. 1920×1080"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          </div>

          {/* Featured / starred toggle */}
          {item._source !== 'ai' && (
            <button
              type="button"
              onClick={() => setFeatured(f => f ? 0 : 1)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors
                ${featured
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:border-portal-accent hover:text-on-canvas'
                }`}
            >
              <Star className={`w-4 h-4 flex-shrink-0 ${featured ? 'fill-amber-400' : ''}`} />
              <div className="text-left">
                <p className="text-sm font-medium leading-none mb-0.5">
                  {featured ? 'Starred — shows first in gallery' : 'Not starred'}
                </p>
                <p className="text-xs opacity-60">Click to {featured ? 'remove star' : 'star this item'}</p>
              </div>
            </button>
          )}

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
              {saving ? (selectedFile ? 'Uploading…' : 'Saving…') : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── FileDetailModal ──────────────────────────────────────────────────────────

interface FileDetailModalProps {
  item: LibraryItem
  onBack: () => void
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function FileDetailModal({ item, onBack, onClose, onEdit, onDelete }: FileDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const Icon = TYPE_ICONS[item.type] ?? FolderOpen

  const fileExt = item.file_url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(fileExt)
  const isVideo = ['mp4','mov','webm','avi','m4v'].includes(fileExt)
  const isPdf   = fileExt === 'pdf'

  return (
    <>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-on-canvas-muted hover:text-on-canvas transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="aspect-video bg-portal-bg flex items-center justify-center overflow-hidden">
          {item.thumbnail_url
            ? <img src={item.thumbnail_url} alt={item.displayName} className="w-full h-full object-contain" />
            : <Icon className="w-20 h-20 text-on-canvas-muted opacity-30" />
          }
        </div>

        {/* Metadata + actions */}
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-portal-accent uppercase tracking-wider">
                {displayBrand(item.brand)}
              </span>
              <span className="text-on-canvas-muted text-xs">·</span>
              <span className="text-on-canvas-muted text-xs">{item.type}</span>
            </div>
            <h3 className="text-on-canvas text-lg font-semibold leading-tight">{item.displayName}</h3>
            {'description' in item && item.description && (
              <p className="text-on-canvas-muted text-sm mt-1">{item.description}</p>
            )}
            {item._source === 'ai' && (item as any).prompt && (
              <p className="text-on-canvas-muted text-sm mt-1 italic">"{(item as any).prompt}"</p>
            )}
            {item._source === 'ai' && (item as any).created_by && (
              <p className="text-on-canvas-muted text-xs mt-1">Created by {(item as any).created_by}</p>
            )}
            {(item.file_size || item.dimensions) && (
              <div className="flex items-center gap-2 mt-2">
                {item.file_size && <span className="text-on-canvas-muted text-xs">{item.file_size}</span>}
                {item.file_size && item.dimensions && <span className="text-on-canvas-muted text-xs">·</span>}
                {item.dimensions && <span className="text-on-canvas-muted text-xs">{item.dimensions}</span>}
              </div>
            )}
          </div>

          {/* View + Download */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewerOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-elevated border border-portal-border
                         hover:bg-portal-border text-on-canvas rounded-lg text-sm font-medium transition-colors"
            >
              <Eye className="w-4 h-4" />
              View
            </button>
            <button
              onClick={() => triggerDownload(item.file_url, item.displayName)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-portal-accent hover:bg-portal-accent/90
                         text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>

          {/* Admin controls */}
          {(onEdit || onDelete) && (
            <div className="flex gap-3">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-surface-elevated border border-portal-border
                             hover:bg-portal-border text-on-canvas rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              )}
              {onDelete && (
                confirmDelete ? (
                  <div className="flex-1 flex gap-2">
                    <button
                      onClick={onDelete}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2.5 bg-surface-elevated border border-portal-border text-on-canvas-subtle rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20
                               text-red-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── File viewer lightbox ─────────────────────────────────────────────── */}

    {viewerOpen && (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
        onClick={() => setViewerOpen(false)}
      >
        <button
          onClick={() => setViewerOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close viewer"
        >
          <X className="w-5 h-5" />
        </button>
        <div onClick={e => e.stopPropagation()} className="max-w-5xl w-full max-h-[90vh] flex items-center justify-center">
          {isImage && (
            <img
              src={item.file_url}
              alt={item.displayName}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          )}
          {isVideo && (
            <video
              src={item.file_url}
              controls
              autoPlay
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
            />
          )}
          {isPdf && (
            <iframe
              src={item.file_url}
              title={item.displayName}
              className="w-full h-[85vh] rounded-lg shadow-2xl bg-white"
            />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div className="text-center text-white">
              <p className="mb-4 text-on-canvas-muted">Preview not available for this file type.</p>
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent rounded-lg text-white text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  )
}

// ─── FileExplorerModal ────────────────────────────────────────────────────────

interface FileExplorerModalProps {
  brand: string
  section: string   // '__all__' = show everything for this brand
  items: LibraryItem[]
  onClose: () => void
  onSelect: (item: LibraryItem) => void
  onEdit?: (item: LibraryItem) => void
  onDelete?: (item: LibraryItem) => void
  canDeleteItem?: (item: LibraryItem) => boolean
}

function FileExplorerModal({ brand, section, items, onClose, onSelect, onEdit, onDelete, canDeleteItem }: FileExplorerModalProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const isAll = section === '__all__'
  const sectionLabel = isAll ? 'All Items' : section

  function itemKey(item: LibraryItem) { return `${item._source}-${item.id}` }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Folder className="w-5 h-5 text-portal-accent" />
            <h2 className="text-on-canvas font-semibold">
              {displayBrand(brand)} — {sectionLabel}
            </h2>
            <span className="text-on-canvas-muted text-sm">
              ({items.length} {items.length === 1 ? 'file' : 'files'})
            </span>
          </div>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted">
              <FolderOpen className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No files in this section</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {items.map(item => {
                const Icon = TYPE_ICONS[item.type] ?? FolderOpen
                const key = itemKey(item)
                const pendingDelete = confirmDeleteId === key
                // In "All Items" view, show the section name as a subtitle
                const sectionName = isAll ? (SECTION_MAP[item.type] ?? item.type) : null

                return (
                  <div
                    key={key}
                    className="relative group cursor-pointer"
                    onClick={() => !pendingDelete && onSelect(item)}
                  >
                    <div className="aspect-square bg-portal-bg rounded-xl overflow-hidden border border-portal-border group-hover:border-portal-accent/40 transition-all">
                      {item.thumbnail_url
                        ? <img src={item.thumbnail_url} alt={item.displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon className="w-10 h-10 text-on-canvas-muted opacity-40" />
                          </div>
                        )
                      }

                      {/* Admin controls — shown on hover */}
                      {(onEdit || onDelete) && (
                        <div
                          className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => e.stopPropagation()}
                        >
                          {onEdit && !pendingDelete && (
                            <button
                              onClick={() => onEdit(item)}
                              className="p-1.5 bg-black/70 hover:bg-portal-accent rounded text-white transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {onDelete && (canDeleteItem ? canDeleteItem(item) : true) && (
                            pendingDelete ? (
                              <>
                                <button
                                  onClick={() => { onDelete(item); setConfirmDeleteId(null) }}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white font-medium transition-colors"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 bg-black/70 hover:bg-black/90 rounded text-[10px] text-white font-medium transition-colors"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(key)}
                                className="p-1.5 bg-black/70 hover:bg-red-500 rounded text-white transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    <p className="mt-1.5 text-on-canvas-muted text-xs text-center truncate px-1 leading-tight">
                      {item.displayName}
                    </p>
                    {sectionName && (
                      <p className="text-portal-accent/70 text-[10px] text-center truncate px-1 leading-tight">
                        {sectionName}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Brand Section ────────────────────────────────────────────────────────────

interface BrandSectionProps {
  brand: string
  sectionMap: Map<string, LibraryItem[]>
  expanded: boolean
  onToggle: () => void
  onShowAll: (section: string) => void
  onSelectItem: (item: LibraryItem) => void
  isAdmin: boolean
  onToggleFeatured: (item: LibraryItem) => void
}

function BrandSection({ brand, sectionMap, expanded, onToggle, onShowAll, onSelectItem, isAdmin, onToggleFeatured }: BrandSectionProps) {
  const sections = Array.from(sectionMap.entries())
  const [activeSection, setActiveSection] = useState('__all__')

  const allItems = Array.from(sectionMap.values()).flat()
  const totalItems = allItems.length

  // Featured items always sort first within the active view
  function sortFeaturedFirst(items: LibraryItem[]): LibraryItem[] {
    return [...items].sort((a, b) => ((b.featured ?? 0) - (a.featured ?? 0)))
  }

  const activeSectionItems = sortFeaturedFirst(
    activeSection === '__all__' ? allItems : (sectionMap.get(activeSection) ?? allItems)
  )

  return (
    <div className="bg-surface border border-portal-border rounded-2xl overflow-hidden">
      {/* Brand header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-elevated transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded
            ? <ChevronDown className="w-5 h-5 text-on-canvas-muted flex-shrink-0" />
            : <ChevronRight className="w-5 h-5 text-on-canvas-muted flex-shrink-0" />
          }
          <h2 className="text-on-canvas font-semibold text-lg">{displayBrand(brand)}</h2>
          <span className="text-on-canvas-muted text-sm">
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-portal-border">
          {/* View All [Brand] button */}
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <p className="text-on-canvas-subtle text-sm font-medium">Browse by category</p>
            <button
              onClick={() => onShowAll('__all__')}
              className="flex items-center gap-2 px-4 py-1.5 bg-surface-elevated border border-portal-border
                         hover:border-portal-accent/50 hover:text-portal-accent text-on-canvas-subtle
                         rounded-lg text-sm font-medium transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              View all {displayBrand(brand)} ({totalItems})
            </button>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {/* Sub-category pills */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveSection('__all__')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${activeSection === '__all__'
                    ? 'bg-portal-accent text-white'
                    : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
                  }`}
              >
                All ({totalItems})
              </button>
              {sections.map(([sectionName, sectionItems]) => (
                <button
                  key={sectionName}
                  onClick={() => setActiveSection(sectionName)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${activeSection === sectionName
                      ? 'bg-portal-accent text-white'
                      : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
                    }`}
                >
                  {sectionName} ({sectionItems.length})
                </button>
              ))}
            </div>

            {/* Preview strip — up to 8 clickable thumbnails (2 rows of 4) */}
            <div className="grid grid-cols-4 gap-3">
              {activeSectionItems.slice(0, 8).map(item => {
                const Icon = TYPE_ICONS[item.type] ?? FolderOpen
                const isFeatured = !!(item.featured)
                return (
                  <div
                    key={`${item._source}-${item.id}`}
                    className="relative aspect-video bg-portal-bg rounded-xl border overflow-hidden
                               hover:scale-[1.02] transition-all group cursor-pointer
                               border-portal-border hover:border-portal-accent/40"
                    onClick={() => onSelectItem(item)}
                  >
                    {item.thumbnail_url
                      ? <img
                          src={item.thumbnail_url}
                          alt={item.displayName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
                          <Icon className="w-7 h-7 text-on-canvas-muted opacity-40 flex-shrink-0" />
                          <p className="text-on-canvas-muted text-[10px] text-center line-clamp-2 leading-tight">
                            {item.displayName}
                          </p>
                        </div>
                      )
                    }
                    {/* Star button — always visible when starred; shown on hover for admin */}
                    {(isAdmin || isFeatured) && (
                      <button
                        onClick={e => { e.stopPropagation(); if (isAdmin) onToggleFeatured(item) }}
                        title={isAdmin ? (isFeatured ? 'Remove from featured' : 'Feature this item') : 'Featured'}
                        className={`absolute top-1.5 left-1.5 p-1 rounded-full transition-all
                          ${isFeatured
                            ? 'opacity-100 bg-black/40'
                            : 'opacity-0 group-hover:opacity-100 bg-black/40'
                          }
                          ${isAdmin ? 'cursor-pointer hover:scale-110' : 'cursor-default pointer-events-none'}
                        `}
                      >
                        <Star
                          className="w-3.5 h-3.5"
                          fill={isFeatured ? '#facc15' : 'none'}
                          stroke={isFeatured ? '#facc15' : 'white'}
                        />
                      </button>
                    )}
                  </div>
                )
              })}
              {/* Filler slots to complete the last row */}
              {activeSectionItems.length < 8 && activeSectionItems.length % 4 !== 0 && (
                [...Array(4 - (activeSectionItems.length % 4))].map((_, i) => (
                  <div key={`filler-${i}`} className="aspect-video bg-portal-bg/40 rounded-xl border border-portal-border/30" />
                ))
              )}
            </div>

            {/* Footer: count + Show all [section] */}
            <div className="flex items-center justify-between">
              <p className="text-on-canvas-muted text-sm">
                {activeSectionItems.length > 8
                  ? `Showing 8 of ${activeSectionItems.length} files`
                  : `${activeSectionItems.length} ${activeSectionItems.length === 1 ? 'file' : 'files'}`
                }
              </p>
              <button
                onClick={() => onShowAll(activeSection === '__all__' ? '__all__' : activeSection)}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                           text-portal-accent rounded-lg text-sm font-medium transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                {activeSection === '__all__' ? `Show all ${displayBrand(brand)}` : `Show all ${activeSection}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Product Shots ────────────────────────────────────────────────────────────

interface ProductShot {
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

function ProductShotDetailModal({
  shot, isAdmin, onBack, onClose, onEdit, onDelete,
}: {
  shot: ProductShot
  isAdmin: boolean
  onBack: () => void
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [viewerOpen, setViewerOpen] = useState(false)

  function download() {
    const token = localStorage.getItem('portal_token')
    fetch(`${import.meta.env.VITE_API_URL}/api/product-shots/${shot.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.blob())
      .then(blob => {
        const ext = shot.filename.split('.').pop() ?? 'jpg'
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${shot.label}.${ext}`
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-on-canvas-muted hover:text-on-canvas transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Preview */}
          <div className="bg-portal-bg flex items-center justify-center overflow-hidden" style={{ minHeight: 260 }}>
            <img
              src={shot.file_url}
              alt={shot.label}
              className="max-h-72 max-w-full object-contain"
            />
          </div>

          {/* Metadata + actions */}
          <div className="p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-portal-accent uppercase tracking-wider">Product Shots</span>
                <span className="text-on-canvas-muted text-xs">·</span>
                <span className="text-on-canvas-muted text-xs">Product Shot</span>
              </div>
              <h3 className="text-on-canvas text-lg font-semibold leading-tight">{shot.label}</h3>
              <div className="flex items-center gap-2 mt-2">
                {shot.file_size && <span className="text-on-canvas-muted text-xs">{shot.file_size}</span>}
              </div>
            </div>

            {/* View + Download */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewerOpen(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-surface-elevated border border-portal-border
                           hover:bg-portal-border text-on-canvas rounded-lg text-sm font-medium transition-colors"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              <button
                onClick={download}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-portal-accent hover:bg-portal-accent/90
                           text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>

            {/* Admin controls */}
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={onEdit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-surface-elevated border border-portal-border
                             hover:bg-portal-border text-on-canvas rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/10 border border-red-500/30
                             hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen viewer */}
      {viewerOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setViewerOpen(false)}
        >
          <button
            onClick={() => setViewerOpen(false)}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={shot.file_url}
            alt={shot.label}
            className="max-h-[90vh] max-w-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

function ProductShotsModal({
  shots, isAdmin, onClose, onEdit, onDelete, onSelect,
}: {
  shots: ProductShot[]
  isAdmin: boolean
  onClose: () => void
  onEdit: (s: ProductShot) => void
  onDelete: (s: ProductShot) => void
  onSelect: (s: ProductShot) => void
}) {
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [selectMode, setSelectMode] = useState(false)

  const filtered = shots.filter(s =>
    !search || s.label.toLowerCase().includes(search.toLowerCase()) || s.filename.toLowerCase().includes(search.toLowerCase())
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id))

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(s => next.delete(s.id))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...filtered.map(s => s.id)]))
    }
  }

  async function handleDownload() {
    const toDownload = filtered.filter(s => selected.has(s.id))
    if (toDownload.length === 0) return
    setDownloading(true)
    const token = localStorage.getItem('portal_token')
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      if (toDownload.length <= 5) {
        // Individual downloads
        for (const shot of toDownload) {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/product-shots/${shot.id}/download`, { headers: authHeaders })
          const blob = await res.blob()
          const ext = shot.filename.split('.').pop() ?? 'jpg'
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `${shot.label}.${ext}`
          a.click()
          URL.revokeObjectURL(a.href)
          // Small stagger to avoid browser blocking multiple downloads
          await new Promise(r => setTimeout(r, 300))
        }
      } else {
        // ZIP download
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        await Promise.all(toDownload.map(async shot => {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/product-shots/${shot.id}/download`, { headers: authHeaders })
          const blob = await res.blob()
          const ext = shot.filename.split('.').pop() ?? 'jpg'
          zip.file(`${shot.label}.${ext}`, blob)
        }))
        const content = await zip.generateAsync({ type: 'blob' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(content)
        a.download = `product-shots-${toDownload.length}.zip`
        a.click()
        URL.revokeObjectURL(a.href)
      }
    } finally {
      setDownloading(false)
    }
  }

  const selectedCount = filtered.filter(s => selected.has(s.id)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Image className="w-5 h-5 text-portal-accent" />
            <h2 className="text-on-canvas font-semibold">Product Shots</h2>
            <span className="text-on-canvas-muted text-sm">
              ({filtered.length} {filtered.length === 1 ? 'image' : 'images'})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectMode(m => !m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${selectMode
                  ? 'bg-portal-accent border-portal-accent text-white'
                  : 'bg-surface-elevated border-portal-border text-on-canvas-subtle hover:border-portal-accent/40 hover:text-on-canvas'
                }`}
            >
              Select
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-canvas-muted" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product shots…"
                className="bg-surface-elevated border border-portal-border rounded-lg pl-8 pr-3 py-1.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors w-52"
                autoFocus
              />
            </div>
            <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Selection toolbar */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-portal-border/50 bg-surface-elevated flex-shrink-0">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs text-on-canvas-subtle hover:text-on-canvas transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                ${allFilteredSelected ? 'bg-portal-accent border-portal-accent' : 'border-portal-border'}`}>
                {allFilteredSelected && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>

            {selectedCount > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-on-canvas-muted text-xs">{selectedCount} selected</span>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/90
                             disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {downloading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />
                  }
                  {downloading
                    ? 'Preparing…'
                    : selectedCount > 5
                      ? `Download as ZIP (${selectedCount})`
                      : `Download (${selectedCount})`
                  }
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-on-canvas-muted hover:text-on-canvas transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scrollable grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted">
              <Image className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">{search ? 'No images match your search' : 'No product shots yet'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filtered.map(shot => {
                const pendingDelete = confirmDeleteId === shot.id
                const isSelected = selected.has(shot.id)
                return (
                  <div
                    key={shot.id}
                    className="relative group cursor-pointer"
                    onClick={() => {
                      if (pendingDelete) return
                      if (selectMode) toggleSelect(shot.id)
                      else onSelect(shot)
                    }}
                  >
                    <div className={`aspect-square bg-portal-bg rounded-xl overflow-hidden border transition-all
                      ${isSelected
                        ? 'border-portal-accent ring-2 ring-portal-accent/40'
                        : 'border-portal-border group-hover:border-portal-accent/40'
                      }`}>
                      <img
                        src={shot.file_url}
                        alt={shot.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />

                      {/* Select checkbox — always visible when selected, hover otherwise */}
                      <div
                        className={`absolute top-1.5 left-1.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={e => { e.stopPropagation(); toggleSelect(shot.id) }}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shadow
                          ${isSelected ? 'bg-portal-accent border-portal-accent' : 'bg-black/50 border-white/70'}`}>
                          {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                        </div>
                      </div>

                      {/* Admin controls */}
                      {isAdmin && (
                        <div
                          className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => e.stopPropagation()}
                        >
                          {!pendingDelete && (
                            <button
                              onClick={() => onEdit(shot)}
                              className="p-1.5 bg-black/70 hover:bg-portal-accent rounded text-white transition-colors"
                              title="Rename"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {pendingDelete ? (
                            <>
                              <button
                                onClick={() => { onDelete(shot); setConfirmDeleteId(null) }}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white font-medium transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 bg-black/70 hover:bg-black/90 rounded text-[10px] text-white font-medium transition-colors"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(shot.id)}
                              className="p-1.5 bg-black/70 hover:bg-red-500 rounded text-white transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <p className="mt-1.5 text-on-canvas-subtle text-xs truncate px-0.5">{shot.label}</p>
                    <p className="text-on-canvas-muted text-[10px] truncate px-0.5">{shot.file_size}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductShotsSection({ isAdmin }: { isAdmin: boolean }) {
  const [shots, setShots] = useState<ProductShot[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [detailShot, setDetailShot] = useState<ProductShot | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadCount, setUploadCount] = useState(0)
  const [editTarget, setEditTarget] = useState<ProductShot | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [lightbox, setLightbox] = useState<ProductShot | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'
  const token = () => localStorage.getItem('portal_token') ?? ''

  useEffect(() => {
    fetch(`${API_BASE}/product-shots`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setShots(d.shots ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setUploading(true)
    setUploadErrors([])
    setUploadCount(0)
    const form = new FormData()
    arr.forEach(f => form.append('files', f))
    try {
      const res = await fetch(`${API_BASE}/product-shots/bulk-upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      })
      const data = await res.json()
      if (data.items?.length > 0) {
        setShots(prev => [...(data.items as ProductShot[]), ...prev])
        setUploadCount(data.count)
      }
      if (data.errors?.length > 0) setUploadErrors(data.errors)
    } catch (err: any) {
      setUploadErrors([err.message ?? 'Upload failed'])
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  async function saveEdit() {
    if (!editTarget || !editLabel.trim()) return
    setEditSaving(true)
    try {
      const res = await fetch(`${API_BASE}/product-shots/${editTarget.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() }),
      })
      const updated = await res.json()
      setShots(prev => prev.map(s => s.id === updated.id ? updated : s))
      setEditTarget(null)
    } catch (err: any) {
      alert(err.message ?? 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteShot(id: number) {
    setDeleting(true)
    try {
      await fetch(`${API_BASE}/product-shots/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      })
      setShots(prev => prev.filter(s => s.id !== id))
      if (lightbox?.id === id) setLightbox(null)
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    setBulkDeleting(true)
    try {
      await fetch(`${API_BASE}/product-shots/bulk-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setShots(prev => prev.filter(s => !ids.includes(s.id)))
      setSelected(new Set())
    } finally {
      setBulkDeleting(false)
      setBulkConfirm(false)
    }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      {/* Section card */}
      <div className="bg-surface border border-portal-border rounded-2xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-elevated transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-portal-accent/10 flex items-center justify-center flex-shrink-0">
              <Image className="w-4 h-4 text-portal-accent" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-on-canvas font-semibold text-sm">Product Shots</span>
                <span className="px-2 py-0.5 bg-portal-accent/10 text-portal-accent text-xs font-medium rounded-full">
                  {shots.length}
                </span>
              </div>
              <p className="text-on-canvas-muted text-xs mt-0.5">High-res product photography for all brands</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {shots.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setShowModal(true) }}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-portal-border
                           hover:border-portal-accent/40 rounded-lg text-on-canvas-subtle hover:text-on-canvas
                           text-xs font-medium transition-colors"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                View all Product Shots ({shots.length})
              </button>
            )}
            {isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/90
                           disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? 'Uploading…' : 'Bulk Upload'}
              </button>
            )}
            {isAdmin && selected.size > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setBulkConfirm(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600
                           text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selected.size}
              </button>
            )}
            {expanded
              ? <ChevronDown className="w-4 h-4 text-on-canvas-muted" />
              : <ChevronRight className="w-4 h-4 text-on-canvas-muted" />
            }
          </div>
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />

        {/* Body */}
        {expanded && (
          <div className="border-t border-portal-border px-6 py-5">

            {/* Upload feedback */}
            {uploadCount > 0 && (
              <div className="mb-4 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-xs">
                {uploadCount} image{uploadCount > 1 ? 's' : ''} uploaded successfully.
              </div>
            )}
            {uploadErrors.length > 0 && (
              <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs space-y-0.5">
                {uploadErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            {/* Drop zone (admin only, shown when no shots) */}
            {isAdmin && shots.length === 0 && !loading && (
              <div
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-portal-border hover:border-portal-accent/50 rounded-xl
                           flex flex-col items-center justify-center py-16 gap-3 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-on-canvas-muted opacity-40" />
                <p className="text-on-canvas-muted text-sm">Drop images here or click to upload</p>
                <p className="text-on-canvas-muted/60 text-xs">JPEG, PNG, WebP, GIF, TIFF</p>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-portal-bg animate-pulse" />
                ))}
              </div>
            ) : shots.length > 0 ? (
              <>
                {/* Drop zone strip for additional uploads */}
                {isAdmin && (
                  <div
                    onDrop={onDrop}
                    onDragOver={e => e.preventDefault()}
                    className="mb-4 border border-dashed border-portal-border hover:border-portal-accent/40
                               rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-on-canvas-muted
                               hover:text-portal-accent transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Drop more images here or click Bulk Upload
                  </div>
                )}

                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                  {shots.slice(0, 8).map(shot => (
                    <div
                      key={shot.id}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-portal-bg border border-portal-border cursor-pointer"
                      onClick={() => setDetailShot(shot)}
                    >
                      <img
                        src={shot.file_url}
                        alt={shot.label}
                        className="w-full h-full object-cover"
                      />
                      {/* Label tooltip */}
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-black/60
                                      opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-[10px] truncate leading-tight">{shot.label}</p>
                      </div>
                      {/* Admin actions */}
                      {isAdmin && (
                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setEditTarget(shot); setEditLabel(shot.label) }}
                            className="w-6 h-6 bg-black/60 hover:bg-portal-accent rounded flex items-center justify-center"
                          >
                            <Pencil className="w-3 h-3 text-white" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(shot.id) }}
                            className="w-6 h-6 bg-black/60 hover:bg-red-500 rounded flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      )}
                      {/* Select checkbox */}
                      {isAdmin && (
                        <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <input
                            type="checkbox"
                            checked={selected.has(shot.id)}
                            onChange={e => { e.stopPropagation(); toggleSelect(shot.id) }}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-portal-accent rounded cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* View All Modal */}
      {showModal && (
        <ProductShotsModal
          shots={shots}
          isAdmin={isAdmin}
          onClose={() => setShowModal(false)}
          onEdit={(shot) => { setShowModal(false); setEditTarget(shot); setEditLabel(shot.label) }}
          onDelete={(shot) => { setShowModal(false); setConfirmDeleteId(shot.id) }}
          onSelect={(shot) => { setDetailShot(shot) }}
        />
      )}

      {/* Detail modal */}
      {detailShot && (
        <ProductShotDetailModal
          shot={detailShot}
          isAdmin={isAdmin}
          onBack={() => setDetailShot(null)}
          onClose={() => { setDetailShot(null); setShowModal(false) }}
          onEdit={() => { setEditTarget(detailShot); setEditLabel(detailShot.label); setDetailShot(null) }}
          onDelete={() => { setConfirmDeleteId(detailShot.id); setDetailShot(null) }}
        />
      )}

      {/* Edit label modal */}
      {editTarget && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border border-portal-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-on-canvas font-semibold text-base mb-4">Rename Image</h3>
            <input
              type="text"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditTarget(null) }}
              className="w-full bg-surface-elevated border border-portal-border rounded-lg px-3 py-2 text-on-canvas
                         text-sm focus:outline-none focus:border-portal-accent mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editLabel.trim()}
                className="px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-50
                           text-white rounded-lg text-sm font-medium transition-colors"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border border-portal-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-on-canvas font-semibold text-base mb-2">Delete image?</h3>
            <p className="text-on-canvas-muted text-sm mb-5">This will permanently remove the image from S3. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteShot(confirmDeleteId)}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50
                           text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirm */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface border border-portal-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-on-canvas font-semibold text-base mb-2">Delete {selected.size} images?</h3>
            <p className="text-on-canvas-muted text-sm mb-5">All selected images will be permanently removed from S3. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkConfirm(false)}
                className="px-4 py-2 text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50
                           text-white rounded-lg text-sm font-medium transition-colors"
              >
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { user } = useAuth()
  const adminUser = isAdmin(user?.role ?? '')
  const [allItems, setAllItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openExplorer, setOpenExplorer] = useState<{ brand: string; section: string } | null>(null)
  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null)
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set(['Sliquid']))
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Asset[]>('/assets').catch(err => { console.error('[assets]', err); return [] as Asset[] }),
      api.get<Creative[]>('/creatives').catch(err => { console.error('[creatives]', err); return [] as Creative[] }),
      api.get<AiImage[]>('/creator/images').catch(err => { console.error('[creator]', err); return [] as AiImage[] }),
    ])
      .then(([assets, creatives, aiImages]) => {
        const assetItems: LibraryItem[] = assets.map(a => ({
          ...a, _source: 'asset' as const, displayName: a.name,
        }))
        const creativeItems: LibraryItem[] = creatives.map(c => ({
          ...c, _source: 'creative' as const, displayName: c.title,
        }))
        const aiItems: LibraryItem[] = aiImages.map(img => ({
          ...img,
          _source: 'ai' as const,
          displayName: img.prompt.length > 60 ? img.prompt.slice(0, 60) + '…' : img.prompt,
          brand: 'User Generated Content',
          type: 'AI Generated',
          file_url: img.s3_url,
          thumbnail_url: img.s3_url,
        }))
        const combined = [...assetItems, ...creativeItems, ...aiItems]
        setAllItems(combined)
        setExpandedBrands(new Set(combined.map(i => i.brand)))
      })
      .finally(() => setLoading(false))
  }, [])

  function closeAll() {
    setDetailItem(null)
    setOpenExplorer(null)
    setEditingItem(null)
    setShowAddModal(false)
  }

  function handleAdded(item: LibraryItem) {
    setAllItems(prev => {
      const updated = [item, ...prev]
      setExpandedBrands(prev2 => new Set([...prev2, item.brand]))
      return updated
    })
  }

  function handleSaved(updated: LibraryItem) {
    setAllItems(prev => prev.map(i =>
      i._source === updated._source && i.id === updated.id ? updated : i
    ))
  }

  async function handleToggleFeatured(item: LibraryItem) {
    if (item._source === 'ai') return // AI items don't support featured
    const endpoint = item._source === 'asset' ? `/assets/${item.id}/featured` : `/creatives/${item.id}/featured`
    try {
      const result = await api.put<{ id: number; featured: number }>(endpoint, {})
      setAllItems(prev => prev.map(i =>
        i._source === item._source && i.id === item.id ? { ...i, featured: result.featured } : i
      ))
    } catch (err) {
      console.error('[featured] toggle failed', err)
    }
  }

  async function handleDelete(item: LibraryItem) {
    const endpoint =
      item._source === 'asset' ? `/assets/${item.id}` :
      item._source === 'creative' ? `/creatives/${item.id}` :
      `/creator/${item.id}`
    try {
      await api.delete(endpoint)
      setAllItems(prev => prev.filter(i => !(i._source === item._source && i.id === item.id)))
      setDetailItem(prev => prev && prev._source === item._source && prev.id === item.id ? null : prev)
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete item')
    }
  }

  function toggleBrand(brand: string) {
    setExpandedBrands(prev => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  // Search-filtered items for brand section previews
  const filteredItems = search
    ? allItems.filter(item => {
        const q = search.toLowerCase()
        return item.displayName.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q)
      })
    : allItems

  const brandMap = groupByBrand(filteredItems)
  const sortedBrandKeys = sortBrands(Array.from(brandMap.keys()))

  // Explorer items — derived from full allItems (no search filtering inside modal)
  const explorerItems: LibraryItem[] = openExplorer
    ? openExplorer.section === '__all__'
      ? allItems.filter(i => i.brand === openExplorer.brand)
      : (groupByBrand(allItems).get(openExplorer.brand)?.get(openExplorer.section) ?? [])
    : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-portal-accent" />
          <h1 className="text-on-canvas text-2xl font-bold">Asset Library</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search library…"
              className="bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors w-52"
            />
          </div>
          {adminUser && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                         text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          )}
        </div>
      </div>

      {/* Product Shots — always visible, independent of brand sections */}
      <ProductShotsSection isAdmin={adminUser} />

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      ) : sortedBrandKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
          <p>{search ? 'No items match your search' : 'No items in the library yet'}</p>
          {adminUser && !search && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                         text-portal-accent rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add the first item
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedBrandKeys.map(brand => (
            <BrandSection
              key={brand}
              brand={brand}
              sectionMap={brandMap.get(brand)!}
              expanded={expandedBrands.has(brand)}
              onToggle={() => toggleBrand(brand)}
              onShowAll={section => setOpenExplorer({ brand, section })}
              onSelectItem={item => setDetailItem(item)}
              isAdmin={adminUser}
              onToggleFeatured={handleToggleFeatured}
            />
          ))}
        </div>
      )}

      {/* FileExplorerModal */}
      {openExplorer && (
        <FileExplorerModal
          brand={openExplorer.brand}
          section={openExplorer.section}
          items={explorerItems}
          onClose={closeAll}
          onSelect={item => setDetailItem(item)}
          onEdit={adminUser ? item => setEditingItem(item) : undefined}
          onDelete={item => handleDelete(item)}
          canDeleteItem={item =>
            adminUser || (item._source === 'ai' && (item as any).user_id === user?.id)
          }
        />
      )}

      {/* FileDetailModal — stacked above explorer */}
      {detailItem && (
        <FileDetailModal
          item={detailItem}
          onBack={() => setDetailItem(null)}
          onClose={() => setDetailItem(null)}
          onEdit={adminUser ? () => setEditingItem(detailItem) : undefined}
          onDelete={
            adminUser || (detailItem._source === 'ai' && (detailItem as any).user_id === user?.id)
              ? () => handleDelete(detailItem)
              : undefined
          }
        />
      )}

      {/* AddItemModal */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
          onBulkAdded={items => {
            setAllItems(prev => {
              const updated = [...items, ...prev]
              items.forEach(item => setExpandedBrands(prev2 => new Set([...prev2, item.brand])))
              return updated
            })
          }}
        />
      )}

      {/* EditItemModal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={closeAll}
          onSaved={updated => { handleSaved(updated); setEditingItem(null) }}
        />
      )}
    </div>
  )
}
