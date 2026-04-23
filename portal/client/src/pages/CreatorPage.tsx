import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { AiImage } from '@/types'
import { Sparkles, Send, Download, Trash2, Loader2, Bot, AlertCircle, ImagePlus, X, Search, Images } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Lampy loading messages ───────────────────────────────────────────────────

const LAMPY_LOADING_MSGS = [
  'Working on image…',
  'Creating a masterpiece…',
  'Adding detail…',
  'Fixing the bottle…',
  'Perfecting the lighting…',
  'Almost there…',
]

function LampyLoadingMessage() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % LAMPY_LOADING_MSGS.length), 2200)
    return () => clearInterval(t)
  }, [])
  return <span className="text-on-canvas-muted text-sm">{LAMPY_LOADING_MSGS[idx]}</span>
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface RefImage {
  data: string       // base64, no prefix (empty for gallery images)
  mimeType: string
  preview: string    // object URL or S3 URL for display
  sourceUrl?: string // gallery images only — server fetches this to avoid CORS
}

type ChatMsg =
  | { key: string; role: 'user'; text: string; refPreview?: string }
  | { key: string; role: 'lampy-loading' }
  | { key: string; role: 'lampy-image'; image: AiImage }
  | { key: string; role: 'lampy-error'; text: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<{ data: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result is "data:image/png;base64,XXXXXX" — strip the prefix
      const [prefix, data] = result.split(',')
      const mimeType = prefix.replace('data:', '').replace(';base64', '')
      resolve({ data, mimeType, preview: result })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

// ─── Gallery types ────────────────────────────────────────────────────────────

interface GalleryImg {
  id: number
  label: string
  filename: string
  file_url: string
  mime_type: string
}

// ─── GalleryPickerModal ───────────────────────────────────────────────────────

const GALLERY_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

interface GalleryPickerModalProps {
  images: GalleryImg[]
  loading: boolean
  onClose: () => void
  onInsert: (imgs: GalleryImg[]) => void
  maxPick?: number
}

function GalleryPickerModal({ images, loading, onClose, onInsert, maxPick = 1 }: GalleryPickerModalProps) {
  const [search, setSearch] = useState('')
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set())

  const galleryBrandTier = (i: GalleryImg) => {
    const text = (i.label + ' ' + i.filename).toLowerCase()
    if (text.includes('ride')) return 2
    if (text.includes('sliquid')) return 0
    return 1
  }

  const filtered = images
    .filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase()) || i.filename.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => galleryBrandTier(a) - galleryBrandTier(b))

  function togglePick(id: number) {
    setPickedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      if (next.size >= maxPick) {
        if (maxPick === 1) { next.clear(); next.add(id); return next }
        return prev // at max
      }
      next.add(id); return next
    })
  }

  function handleInsert() {
    const imgs = images.filter(i => pickedIds.has(i.id))
    if (imgs.length === 0) return
    onInsert(imgs)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-surface border border-portal-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Images className="w-4 h-4 text-portal-accent" />
            <h2 className="text-on-canvas font-semibold text-sm">Reference Gallery</h2>
          </div>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-portal-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search images…"
              className="w-full bg-surface-elevated border border-portal-border rounded-lg pl-9 pr-3 py-2 text-on-canvas text-sm placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-portal-accent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Images className="w-8 h-8 text-on-canvas-muted/30 mx-auto mb-2" />
              <p className="text-on-canvas-muted text-sm">{search ? 'No images match your search' : 'No reference images — upload some in Reference Gallery'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(img => {
                const isPicked = pickedIds.has(img.id)
                return (
                  <div
                    key={img.id}
                    onClick={() => togglePick(img.id)}
                    className={cn(
                      'relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all',
                      pickedIds.has(img.id) ? 'border-portal-accent ring-2 ring-portal-accent/30' : 'border-portal-border hover:border-portal-accent/50',
                    )}
                  >
                    <img src={img.file_url} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                    {pickedIds.has(img.id) && (
                      <div className="absolute inset-0 bg-portal-accent/20 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-portal-accent flex items-center justify-center">
                          {maxPick > 1
                            ? <span className="text-white text-xs font-bold">{[...pickedIds].indexOf(img.id) + 1}</span>
                            : <Search className="w-3.5 h-3.5 text-white" />
                          }
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                      <p className="text-white text-[10px] font-medium truncate">{img.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-portal-border flex items-center justify-between flex-shrink-0">
          <span className="text-on-canvas-muted text-xs">
            {pickedIds.size === 0
              ? maxPick > 1 ? `Select up to ${maxPick}` : 'Select an image'
              : `${pickedIds.size} image${pickedIds.size > 1 ? 's' : ''} selected`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-on-canvas-subtle hover:text-on-canvas border border-portal-border rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={pickedIds.size === 0}
              className="px-4 py-2 text-sm font-medium bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              Insert Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LampyAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center flex-shrink-0 mt-1">
      <Bot className="w-4 h-4 text-portal-accent" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreatorPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'tier5'
  const MAX_REFS = isAdmin ? 5 : 1
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refImages, setRefImages] = useState<RefImage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryImages, setGalleryImages] = useState<GalleryImg[]>([])
  const [galleryLoaded, setGalleryLoaded] = useState(false)
  const [galleryBusy, setGalleryBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragCounter = useRef(0)

  // Load past AI images as chat history on mount
  useEffect(() => {
    api.get<AiImage[]>('/creator/images')
      .then(images => {
        const mine = images.filter(img => img.user_id === user?.id).reverse()
        const msgs: ChatMsg[] = mine.flatMap(img => [
          { key: `user-hist-${img.id}`, role: 'user' as const, text: img.prompt },
          { key: `lampy-hist-${img.id}`, role: 'lampy-image' as const, image: img },
        ])
        setMessages(msgs)
      })
      .catch(() => {})
  }, [user?.id])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Revoke blob URLs when refImages changes to avoid memory leaks
  useEffect(() => {
    return () => {
      refImages.forEach(r => { if (r.preview.startsWith('blob:')) URL.revokeObjectURL(r.preview) })
    }
  }, [refImages])

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!isImageFile(file)) return
    try {
      const ref = await readFileAsBase64(file)
      setRefImages(prev => {
        if (prev.length >= MAX_REFS) return prev  // at cap — ignore extra
        return [...prev, ref]
      })
    } catch { /* silently ignore bad files */ }
  }, [MAX_REFS])

  function removeRefImage(idx: number) {
    setRefImages(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Gallery picker ─────────────────────────────────────────────────────────

  async function fetchGallery() {
    setGalleryBusy(true)
    try {
      const token = localStorage.getItem('portal_token') ?? ''
      const res = await fetch(`${GALLERY_BASE}/reference-images`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data: { images: GalleryImg[] } = await res.json()
        setGalleryImages(data.images)
        setGalleryLoaded(true)
      }
    } catch { /* silently ignore */ } finally {
      setGalleryBusy(false)
    }
  }

  function handleGalleryInsert(imgs: GalleryImg[]) {
    setRefImages(prev => {
      const slots = MAX_REFS - prev.length
      return [
        ...prev,
        ...imgs.slice(0, slots).map(img => ({
          data: '',
          mimeType: img.mime_type || 'image/jpeg',
          preview: img.file_url,
          sourceUrl: img.file_url,
        })),
      ]
    })
    setGalleryOpen(false)
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOver(false)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(f => handleFile(f))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || submitting) return

    const userText = prompt.trim()
    const capturedRefs = refImages
    setPrompt('')
    setRefImages([])
    setSubmitting(true)

    const ts = Date.now()
    const userKey = `user-${ts}`
    const lampyKey = `lampy-${ts}`

    setMessages(prev => [
      ...prev,
      { key: userKey, role: 'user', text: userText, refPreview: capturedRefs[0]?.preview },
      { key: lampyKey, role: 'lampy-loading' },
    ])

    try {
      const body: Record<string, unknown> = { prompt: userText }
      if (capturedRefs.length > 0) {
        const urls = capturedRefs.filter(r => r.sourceUrl).map(r => r.sourceUrl!)
        const b64s = capturedRefs.filter(r => r.data).map(r => ({ data: r.data, mimeType: r.mimeType }))
        if (urls.length > 0) body.referenceImageUrls = urls
        if (b64s.length > 0) body.referenceImages = b64s
      }
      const result = await api.post<AiImage>('/creator/generate', body)
      setMessages(prev => prev.map(m =>
        m.key === lampyKey ? { key: lampyKey, role: 'lampy-image', image: result } : m
      ))
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.key === lampyKey
          ? { key: lampyKey, role: 'lampy-error', text: err.message ?? 'Failed to generate image' }
          : m
      ))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(imageId: number) {
    if (!confirm('Delete this image? It will also be removed from the Asset Library.')) return
    try {
      await api.delete(`/creator/${imageId}`)
      setMessages(prev => prev.filter(m => !(m.role === 'lampy-image' && m.image.id === imageId)))
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete image')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-portal-accent" />
        </div>
        <div>
          <h1 className="text-on-canvas text-xl font-bold">Lampy</h1>
          <p className="text-on-canvas-muted text-sm">Sliquid AI Image Creator</p>
        </div>
      </div>

      {/* Chat scroll area — also the drag-and-drop target */}
      <div
        className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0 relative"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3
                          bg-portal-bg/90 border-2 border-dashed border-portal-accent rounded-2xl pointer-events-none">
            <ImagePlus className="w-10 h-10 text-portal-accent" />
            <p className="text-portal-accent font-semibold text-sm">Drop image as reference</p>
          </div>
        )}

        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="flex gap-3">
            <LampyAvatar />
            <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
              <p className="text-on-canvas text-sm">
                Hi! I'm <span className="font-semibold text-portal-accent">Lampy</span>, Sliquid's AI image creator.
                To begin, click the photo icon in the bottom left corner and select the product you would like to feature in your image.
                In your prompt, provide the size, aesthetic, and overall tone you are looking for in the image. Be as thorough as possible.
                You can also <span className="text-portal-accent font-medium">attach a reference image</span> or drag one onto this window to guide the style.
                Your creations are saved to the Asset Library.
                Your creations are saved to the Asset Library.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => {

          if (msg.role === 'user') {
            return (
              <div key={msg.key} className="flex justify-end">
                <div className="flex flex-col items-end gap-1.5 max-w-xs">
                  {/* Reference image thumbnail in user bubble */}
                  {msg.refPreview && (
                    <div className="relative">
                      <img
                        src={msg.refPreview}
                        alt="Reference"
                        className="w-32 h-32 rounded-xl object-cover border border-portal-accent/30"
                      />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                        reference
                      </span>
                    </div>
                  )}
                  <div className="bg-portal-accent text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-loading') {
            return (
              <div key={msg.key} className="flex gap-3">
                <LampyAvatar />
                <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-portal-accent animate-spin" />
                  <LampyLoadingMessage />
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-error') {
            return (
              <div key={msg.key} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                </div>
                <div className="bg-surface border border-red-500/20 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
                  <p className="text-red-400 text-sm">{msg.text}</p>
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-image') {
            const img = msg.image
            return (
              <div key={msg.key} className="flex gap-3">
                <LampyAvatar />
                <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none overflow-hidden max-w-sm">
                  <img
                    src={img.s3_url}
                    alt={img.prompt}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-t border-portal-border">
                    <button
                      onClick={() => triggerDownload(img.s3_url, `sliquid-ai-${img.id}`)}
                      className="flex items-center gap-1.5 text-portal-accent hover:text-portal-accent/80 text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    {img.user_id === user?.id && (
                      <button
                        onClick={() => handleDelete(img.id)}
                        className="flex items-center gap-1.5 text-on-canvas-muted hover:text-red-400 text-sm transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="pt-3 border-t border-portal-border flex-shrink-0 space-y-2">

        {/* Reference image preview strip — shown when images are attached */}
        {refImages.length > 0 && (
          <div className="flex items-center gap-2 px-1 flex-wrap">
            {refImages.map((ref, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={ref.preview}
                  alt="Reference"
                  className="w-14 h-14 rounded-lg object-cover border border-portal-accent/40"
                />
                <button
                  type="button"
                  onClick={() => removeRefImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-portal-border
                             flex items-center justify-center text-on-canvas-muted hover:text-red-400 hover:border-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <p className="text-on-canvas-muted text-xs">
              {refImages.length === 1 ? 'Reference image attached' : `${refImages.length} reference images attached`} — Lampy will use {refImages.length === 1 ? 'this' : 'these'} as a visual guide
            </p>
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          {/* Image attach button — opens Reference Gallery picker */}
          <button
            type="button"
            onClick={() => { setGalleryOpen(true); if (!galleryLoaded) fetchGallery() }}
            title="Choose a reference image from gallery"
            className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-colors
              ${refImages.length > 0
                ? 'border-portal-accent bg-portal-accent/10 text-portal-accent'
                : 'border-portal-border bg-surface text-on-canvas-muted hover:border-portal-accent hover:text-portal-accent'
              }`}
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          {/* Text input */}
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={submitting}
            placeholder="Describe the product image you want Lampy to create…"
            className="flex-1 bg-surface border border-portal-border rounded-xl px-4 py-3 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent
                       disabled:opacity-50 transition-colors"
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!prompt.trim() || submitting}
            className="flex items-center gap-2 px-5 py-3 bg-portal-accent hover:bg-portal-accent/90
                       disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0"
          >
            {submitting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </form>
      </div>

      {/* Gallery Picker Modal */}
      {galleryOpen && (
        <GalleryPickerModal
          images={galleryImages}
          loading={galleryBusy}
          onClose={() => setGalleryOpen(false)}
          onInsert={handleGalleryInsert}
          maxPick={MAX_REFS - refImages.length}
        />
      )}
    </div>
  )
}
